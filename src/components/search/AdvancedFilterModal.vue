<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { allCommonEffects, allSetMechanics, combatAbilities, commonEffects, formatOptions, getKeywordLabel, setMechanics, specialTypes, triggerKeywords } from '../../utils/filterKeywords'
import { getAllSets, type ScryfallSet } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
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
}>(), {
  mode: 'scryfall',
  localSets: () => [],
})

const emit = defineEmits<{
  close: []
  'update:filters': [filters: AdvancedFilters]
  'reset': []
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
  const allFilters = [
    ...combatAbilities.map(k => ({ ...k, category: 'Combate' })),
    ...allCommonEffects.map(k => ({ ...k, category: 'Efectos' })),
    ...triggerKeywords.map(k => ({ ...k, category: 'Triggers' })),
    ...allSetMechanics.map(k => ({ ...k, category: 'Mecánicas' })),
    ...specialTypes.map(k => ({ ...k, category: 'Tipos' })),
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
    return props.localSets.find(s => s.code === code)?.name || code.toUpperCase()
  }
  return allSets.value.find(s => s.code === code)?.name || code.toUpperCase()
}

// ========== Mana values ==========
const manaValueOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const isManaValueSelected = (value: number) => {
  return f.value.manaValue.values?.includes(value) ?? false
}

const toggleManaValue = (value: number) => {
  const current = f.value.manaValue.values || []
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

const getColorLabel = (value: string): string => colorOptions.find(c => c.value === value)?.label || value
const getTypeLabel = (value: string): string => typeOptions.find(t => t.value === value)?.label || value
const getRarityLabel = (value: string): string => rarityOptions.find(r => r.value === value)?.label || value
const getFormatLabel = (value: string): string => formatOptions.find(f => f.value === value)?.label || value

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
    priceUSD: { min: undefined, max: undefined }, keywords: [],
    isFoil: false, isFullArt: false,
  }
  emit('reset')
  emitUpdate()
}
</script>

<template>
  <BaseModal
      :show="show"
      :title="t('search.modal.title')"
      @close="emit('close'); filterSearchQuery = ''"
  >
    <div class="space-y-4">
      <!-- Buscador de filtros -->
      <div class="relative">
        <input
            v-model="filterSearchQuery"
            type="text"
            :placeholder="t('search.filterPanel.filterSearchPlaceholder')"
            class="w-full bg-primary border-2 border-neon px-4 pr-10 py-3 text-body text-silver placeholder-silver-50 focus:outline-none"
        />
        <button
            v-if="filterSearchQuery.length > 0"
            @click="filterSearchQuery = ''"
            class="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20"
            type="button"
        >
          ✕
        </button>
        <div
            v-if="filterSearchResults.length > 0"
            class="absolute top-full left-0 right-0 bg-primary border-2 border-neon border-t-0 max-h-64 overflow-y-auto z-20"
        >
          <button
              v-for="result in filterSearchResults"
              :key="result.value"
              @click="toggleKeyword(result.value)"
              class="w-full px-4 py-2 flex items-center justify-between hover:bg-neon-10 transition-fast border-b border-silver-30 last:border-b-0"
          >
            <span class="text-small text-silver">
              {{ result.label }}
              <span class="text-tiny text-silver-50 ml-2">{{ result.category }}</span>
            </span>
            <span v-if="f.keywords?.includes(result.value)" class="text-neon text-tiny font-bold">✓</span>
          </button>
        </div>
        <div
            v-if="filterSearchQuery.length >= 2 && filterSearchResults.length === 0"
            class="absolute top-full left-0 right-0 bg-primary border-2 border-neon border-t-0 px-4 py-3 text-small text-silver-50"
        >
          {{ t('search.filterPanel.noFilterResults', { query: filterSearchQuery }) }}
        </div>
      </div>

      <!-- Active filter pills -->
      <div v-if="activeFilterCount > 0" class="flex flex-wrap gap-1">
        <button v-for="color in f.colors" :key="`c-${color}`" @click="removeFilter('color', color)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getColorLabel(color) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="type in f.types" :key="`t-${type}`" @click="removeFilter('type', type)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getTypeLabel(type) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="rarity in f.rarity" :key="`r-${rarity}`" @click="removeFilter('rarity', rarity)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getRarityLabel(rarity) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="format in f.formatLegal" :key="`f-${format}`" @click="removeFilter('format', format)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getFormatLabel(format) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="setCode in f.sets" :key="`s-${setCode}`" @click="removeFilter('set', setCode)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getSetName(setCode) }} <span class="opacity-70">×</span>
        </button>
        <button v-for="keyword in f.keywords" :key="`k-${keyword}`" @click="removeFilter('keyword', keyword)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          {{ getKeywordLabel(keyword) }} <span class="opacity-70">×</span>
        </button>
        <button v-if="f.manaValue?.values?.length || f.manaValue?.min !== undefined || f.manaValue?.max !== undefined"
            @click="removeFilter('manaValue')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          MV: {{ f.manaValue?.values?.length ? f.manaValue.values.map(v => v === 10 ? '10+' : v).join(', ') : `${f.manaValue?.min ?? '?'}-${f.manaValue?.max ?? '?'}` }} <span class="opacity-70">×</span>
        </button>
        <button v-if="f.power?.min !== undefined || f.power?.max !== undefined" @click="removeFilter('power')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          POW: {{ f.power?.min ?? '?' }}-{{ f.power?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="f.toughness?.min !== undefined || f.toughness?.max !== undefined" @click="removeFilter('toughness')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          TOU: {{ f.toughness?.min ?? '?' }}-{{ f.toughness?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="f.priceUSD?.min !== undefined || f.priceUSD?.max !== undefined" @click="removeFilter('priceUSD')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          ${{ f.priceUSD?.min ?? '?' }}-${{ f.priceUSD?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>
        <button v-if="f.isFoil" @click="removeFilter('isFoil')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          Foil <span class="opacity-70">×</span>
        </button>
        <button v-if="f.isFullArt" @click="removeFilter('isFullArt')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast">
          Full Art <span class="opacity-70">×</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Colores -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.colors') || 'Colors' }}
          </span>
          <div class="flex gap-1">
            <button
                v-for="color in colorOptions"
                :key="color.value"
                @click="toggleColor(color.value)"
                :class="[
                  'w-8 h-8 text-sm font-bold transition-fast flex items-center justify-center rounded',
                  f.colors?.includes(color.value)
                    ? 'bg-neon text-primary border-2 border-neon'
                    : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
                ]"
                :title="color.label"
            >
              <ManaIcon :symbol="color.value.toUpperCase()" size="small" />
            </button>
          </div>
        </div>

        <!-- Todos los tipos -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.types') }}
            <HelpTooltip :text="t('help.tooltips.search.types')" :title="t('help.titles.types')" />
          </span>
          <div class="flex flex-wrap gap-1">
            <button
                v-for="type in typeOptions"
                :key="type.value"
                @click="toggleType(type.value)"
                :class="[
                  'px-2 py-1 text-tiny font-bold transition-fast',
                  f.types?.includes(type.value)
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <!-- Rarezas -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.rarity') || 'Rarity' }}
          </span>
          <div class="flex gap-1">
            <button
                v-for="rarity in rarityOptions"
                :key="rarity.value"
                @click="toggleRarity(rarity.value)"
                :class="[
                  'px-2 py-1 text-tiny font-bold transition-fast border',
                  f.rarity?.includes(rarity.value)
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
        </div>

        <!-- Mana Value -->
        <div class="md:col-span-2 lg:col-span-3">
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.manaValue') }}
            <HelpTooltip :text="t('help.tooltips.search.manaValue')" :title="t('help.titles.manaValue')" />
          </span>
          <div class="flex flex-wrap gap-1 items-center">
            <button
                v-for="mv in manaValueOptions"
                :key="mv"
                @click="toggleManaValue(mv)"
                :class="[
                  'w-8 h-8 flex items-center justify-center transition-fast rounded',
                  isManaValueSelected(mv)
                    ? 'bg-neon border-2 border-neon'
                    : 'bg-silver-10 border border-silver-30 hover:border-neon'
                ]"
                :title="mv === 10 ? '10+' : String(mv)"
            >
              <ManaIcon v-if="mv < 10" :symbol="String(mv)" size="small" />
              <span v-else class="text-tiny font-bold" :class="isManaValueSelected(mv) ? 'text-primary' : 'text-silver'">10+</span>
            </button>
            <button
                v-if="f.manaValue?.values?.length"
                @click="clearManaValueSelection"
                class="ml-2 px-2 py-1 text-tiny text-rust hover:bg-rust hover:text-primary transition-fast border border-rust rounded"
            >
              ✕
            </button>
          </div>
          <p v-if="f.manaValue?.values?.length" class="text-tiny text-silver-50 mt-1">
            MV: {{ [...f.manaValue.values].sort((a, b) => a - b).map(v => v === 10 ? '10+' : v).join(', ') }}
          </p>
        </div>

        <!-- Precio USD -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.priceUSD') }}
            <HelpTooltip :text="t('help.tooltips.search.priceUSD')" :title="t('help.titles.priceUSD')" />
          </span>
          <div class="flex gap-2">
            <input
                v-model.number="f.priceUSD.min"
                @change="emitUpdate()"
                type="number" placeholder="Min" step="0.01"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="f.priceUSD.max"
                @change="emitUpdate()"
                type="number" placeholder="Max" step="0.01"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>

        <!-- Power -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.power') }}
            <HelpTooltip :text="t('help.tooltips.search.power')" :title="t('help.titles.power')" />
          </span>
          <div class="flex gap-2">
            <input v-model.number="f.power.min" @change="emitUpdate()" type="number" placeholder="Min"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none" />
            <input v-model.number="f.power.max" @change="emitUpdate()" type="number" placeholder="Max"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none" />
          </div>
        </div>

        <!-- Toughness -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.toughness') }}
            <HelpTooltip :text="t('help.tooltips.search.toughness')" :title="t('help.titles.toughness')" />
          </span>
          <div class="flex gap-2">
            <input v-model.number="f.toughness.min" @change="emitUpdate()" type="number" placeholder="Min"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none" />
            <input v-model.number="f.toughness.max" @change="emitUpdate()" type="number" placeholder="Max"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none" />
          </div>
        </div>

        <!-- Formato Legal -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
            {{ t('search.modal.sections.format') }}
            <HelpTooltip :text="t('help.tooltips.search.format')" :title="t('help.titles.format')" />
          </span>
          <div class="flex flex-wrap gap-1">
            <button
                v-for="format in formatOptions"
                :key="format.value"
                @click="toggleFormat(format.value)"
                :class="[
                  'px-2 py-1 text-tiny font-bold transition-fast',
                  f.formatLegal?.includes(format.value)
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ format.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- ========== EDICIONES / SETS ========== -->
      <div class="border border-silver-30 rounded">
        <button
            @click="toggleAccordion('sets'); loadSets()"
            class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast"
        >
          <span class="text-small font-bold text-silver flex items-center gap-2">
            {{ t('search.accordions.sets') }}
            <HelpTooltip :text="t('help.tooltips.search.sets')" :title="t('help.titles.sets')" />
          </span>
          <span class="flex items-center gap-2">
            <span v-if="f.sets?.length" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">{{ f.sets.length }}</span>
            <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('sets') }">▼</span>
          </span>
        </button>
        <div v-if="isAccordionOpen('sets')" class="px-3 py-2 bg-silver-10/50">
          <div class="relative mb-2">
            <input
                v-model="setSearchQuery"
                type="text"
                :placeholder="t('search.filterPanel.setSearchPlaceholder')"
                class="w-full bg-primary border border-silver-30 px-3 pr-8 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none rounded"
            />
            <button v-if="setSearchQuery.length > 0" @click="setSearchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-silver-50 hover:text-silver transition-colors rounded-full hover:bg-silver-20" type="button">
              ✕
            </button>
          </div>
          <div v-if="setsLoading" class="text-center py-4 text-silver-50 text-small">{{ t('common.loading') }}...</div>
          <div v-if="f.sets?.length" class="flex flex-wrap gap-1 mb-2 pb-2 border-b border-silver-30">
            <button v-for="setCode in f.sets" :key="`selected-${setCode}`" @click="toggleSet(setCode)"
                class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast rounded">
              {{ getSetName(setCode) }} <span class="opacity-70">×</span>
            </button>
          </div>
          <div v-if="!setsLoading" class="max-h-48 overflow-y-auto space-y-1">
            <button
                v-for="set in displaySets"
                :key="set.code"
                @click="toggleSet(set.code)"
                :class="[
                  'w-full px-2 py-1.5 text-left text-small transition-fast flex items-center gap-2 rounded',
                  f.sets?.includes(set.code)
                    ? 'bg-neon text-primary font-bold'
                    : 'text-silver hover:bg-silver-10'
                ]"
            >
              <span class="flex-1 truncate">{{ set.name }}</span>
              <span class="text-tiny opacity-70">{{ set.code.toUpperCase() }}</span>
            </button>
            <p v-if="displaySets.length === 0 && setSearchQuery" class="text-tiny text-silver-50 py-2">
              {{ t('search.filterPanel.noSetsFound') }}
            </p>
          </div>
        </div>
      </div>

      <!-- ========== ACORDEONES DE KEYWORDS ========== -->
      <div class="border border-silver-30 rounded">
        <!-- 1. COMBAT -->
        <div class="border-b border-silver-30">
          <button @click="toggleAccordion('combat')" class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast">
            <span class="text-small font-bold text-silver flex items-center gap-2">
              {{ t('search.accordions.combat') }}
              <HelpTooltip :text="t('help.tooltips.search.combat')" :title="t('help.titles.combat')" />
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(combatAbilities) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">{{ countSelectedInCategory(combatAbilities) }}</span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('combat') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('combat')" class="px-3 py-2 bg-silver-10/50">
            <div class="flex flex-wrap gap-1 mb-2">
              <button v-for="keyword in combatAbilities.slice(0, 6)" :key="keyword.value" @click="toggleKeyword(keyword.value)"
                  :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-primary border border-silver-30 text-silver hover:border-neon']">
                {{ keyword.label }}
              </button>
            </div>
            <div class="flex flex-wrap gap-1 pt-2 border-t border-silver-30/50">
              <button v-for="keyword in combatAbilities.slice(6)" :key="keyword.value" @click="toggleKeyword(keyword.value)"
                  :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-primary border border-silver-30 text-silver hover:border-neon']">
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 2. EFFECTS -->
        <div class="border-b border-silver-30">
          <button @click="toggleAccordion('effects')" class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast">
            <span class="text-small font-bold text-silver flex items-center gap-2">
              {{ t('search.accordions.effects') }}
              <HelpTooltip :text="t('help.tooltips.search.effects')" :title="t('help.titles.effects')" />
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(allCommonEffects) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">{{ countSelectedInCategory(allCommonEffects) }}</span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('effects') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('effects')" class="px-3 py-2 bg-silver-10/50 space-y-3">
            <div v-for="(keywords, catKey) in commonEffects" :key="catKey">
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t(`search.effectCategories.${catKey}`) }}</span>
              <div class="flex flex-wrap gap-1">
                <button v-for="keyword in keywords" :key="keyword.value" @click="toggleKeyword(keyword.value)"
                    :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-primary border border-silver-30 text-silver hover:border-neon']">
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. TRIGGERS -->
        <div class="border-b border-silver-30">
          <button @click="toggleAccordion('triggers')" class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast">
            <span class="text-small font-bold text-silver flex items-center gap-2">
              {{ t('search.accordions.triggers') }}
              <HelpTooltip :text="t('help.tooltips.search.triggers')" :title="t('help.titles.triggers')" />
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(triggerKeywords) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">{{ countSelectedInCategory(triggerKeywords) }}</span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('triggers') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('triggers')" class="px-3 py-2 bg-silver-10/50">
            <div class="flex flex-wrap gap-1">
              <button v-for="keyword in triggerKeywords" :key="keyword.value" @click="toggleKeyword(keyword.value)"
                  :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-primary border border-silver-30 text-silver hover:border-neon']">
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 4. SET MECHANICS -->
        <div>
          <button @click="toggleAccordion('setMechanics')" class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast">
            <span class="text-small font-bold text-silver flex items-center gap-2">
              {{ t('search.accordions.setMechanics') }}
              <HelpTooltip :text="t('help.tooltips.search.setMechanics')" :title="t('help.titles.setMechanics')" />
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(allSetMechanics) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">{{ countSelectedInCategory(allSetMechanics) }}</span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('setMechanics') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('setMechanics')" class="px-3 py-2 bg-silver-10/50 space-y-3">
            <div v-for="(keywords, catKey) in setMechanics" :key="catKey">
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t(`search.mechanicCategories.${catKey}`) }}</span>
              <div class="flex flex-wrap gap-1">
                <button v-for="keyword in keywords" :key="keyword.value" @click="toggleKeyword(keyword.value)"
                    :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-primary border border-silver-30 text-silver hover:border-neon']">
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tipos Especiales -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase mb-2 flex items-center gap-1">
          {{ t('search.modal.sections.specialTypes') }}
          <HelpTooltip :text="t('help.tooltips.search.specialTypes')" :title="t('help.titles.specialTypes')" />
        </span>
        <div class="flex flex-wrap gap-1">
          <button v-for="keyword in specialTypes" :key="keyword.value" @click="toggleKeyword(keyword.value)"
              :class="['px-2 py-1 text-tiny font-bold transition-fast', f.keywords?.includes(keyword.value) ? 'bg-neon text-primary border border-neon' : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon']">
            {{ keyword.label }}
          </button>
        </div>
      </div>

      <!-- Opciones especiales -->
      <div class="flex gap-4 pt-2 border-t border-silver-30 items-center">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="f.isFoil" @change="emitUpdate()" type="checkbox" class="w-4 h-4" />
          <span>{{ t('search.modal.options.foilOnly') }}</span>
        </label>
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="f.isFullArt" @change="emitUpdate()" type="checkbox" class="w-4 h-4" />
          <span>{{ t('search.modal.options.fullArt') }}</span>
        </label>
        <HelpTooltip :text="t('help.tooltips.search.foilFullArt')" :title="t('help.titles.foilFullArt')" />
      </div>

      <!-- Footer -->
      <div class="flex justify-between pt-4 border-t border-silver-30">
        <button
            v-if="activeFilterCount > 0"
            @click="handleReset"
            class="px-4 py-2 text-small font-bold text-rust border border-rust hover:bg-rust hover:text-primary transition-fast rounded"
        >
          {{ t('search.filterPanel.clear') }}
        </button>
        <div v-else></div>
        <BaseButton @click="emit('close')">
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
.rotate-180 { transform: rotate(180deg); }
.transition-transform { transition: transform 150ms ease-out; }
</style>
