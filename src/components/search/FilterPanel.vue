<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { useSearchStore, type FilterOptions } from '../../stores/search'
import { getCardSuggestions } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import SpriteIcon from '../ui/SpriteIcon.vue'

const { t } = useI18n()
const searchStore = useSearchStore()
const showAdvancedFilters = ref(false) // Toggle filtros avanzados

// Buscador de filtros dentro del modal
const filterSearchQuery = ref('')
const filterSearchResults = computed(() => {
  const query = filterSearchQuery.value.toLowerCase().trim()
  if (!query || query.length < 2) return []

  // Buscar en todas las categorías
  const allFilters = [
    ...combatAbilities.map(k => ({ ...k, category: 'Combate' })),
    ...allCommonEffects.map(k => ({ ...k, category: 'Efectos' })),
    ...triggerKeywords.map(k => ({ ...k, category: 'Triggers' })),
    ...allSetMechanics.map(k => ({ ...k, category: 'Mecánicas' })),
    ...specialTypes.map(k => ({ ...k, category: 'Tipos' })),
  ]

  return allFilters
    .filter(k => k.label.toLowerCase().includes(query) || k.value.toLowerCase().includes(query))
    .slice(0, 10) // Limitar a 10 resultados
})

// Acordeones abiertos en el modal
const openAccordions = ref<Set<string>>(new Set())

const toggleAccordion = (id: string) => {
  if (openAccordions.value.has(id)) {
    openAccordions.value.delete(id)
  } else {
    openAccordions.value.add(id)
  }
}

const isAccordionOpen = (id: string) => openAccordions.value.has(id)

// Form state
const filters = reactive<FilterOptions>({
  name: '',
  colors: [],
  types: [],
  manaValue: { min: undefined, max: undefined },
  rarity: [],
  sets: [],
  power: { min: undefined, max: undefined },
  toughness: { min: undefined, max: undefined },
  formatLegal: [],
  priceUSD: { min: undefined, max: undefined },
  keywords: [],
  isFoil: false,
  isFullArt: false,
})

// Sugerencias de nombres
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
let suggestionTimeout: ReturnType<typeof setTimeout>

// Debounce para auto-búsqueda (2 segundos)
let filterDebounceTimeout: ReturnType<typeof setTimeout>

// Watch para auto-búsqueda cuando cambian los filtros (excepto nombre)
watch(
  () => [
    filters.colors,
    filters.types,
    filters.rarity,
    filters.formatLegal,
    filters.manaValue?.min,
    filters.manaValue?.max,
    filters.power?.min,
    filters.power?.max,
    filters.toughness?.min,
    filters.toughness?.max,
    filters.priceUSD?.min,
    filters.priceUSD?.max,
    filters.keywords,
    filters.isFoil,
    filters.isFullArt,
  ],
  () => {
    // Solo auto-buscar si hay al menos un filtro activo
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

  // Limpiar timeout anterior
  clearTimeout(suggestionTimeout)

  if (value.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  // Debounce 300ms
  suggestionTimeout = setTimeout(async () => {
    try {
      const results = await getCardSuggestions(value)
      suggestions.value = results.slice(0, 8)
      showSuggestions.value = true
    } catch (err) {
      console.error('Error obteniendo sugerencias:', err)
      suggestions.value = []
    }
  }, 300)
}

const selectSuggestion = (suggestion: string) => {
  filters.name = suggestion
  showSuggestions.value = false
  suggestions.value = []
  // Trigger search immediately when selecting suggestion
  handleSearch()
}

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

const formatOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'commander', label: 'Commander' },
  { value: 'pioneer', label: 'Pioneer' },
]

// ============ 1. HABILIDADES DE COMBATE (ordenadas por frecuencia de uso) ============
const combatAbilities = [
  // Tier 1 - Más buscadas (~70% de búsquedas)
  { value: 'flying', label: 'Flying' },
  { value: 'trample', label: 'Trample' },
  { value: 'deathtouch', label: 'Deathtouch' },
  { value: 'haste', label: 'Haste' },
  { value: 'lifelink', label: 'Lifelink' },
  { value: 'first strike', label: 'First Strike' },
  // Tier 2 - Comunes (~25%)
  { value: 'double strike', label: 'Double Strike' },
  { value: 'hexproof', label: 'Hexproof' },
  { value: 'flash', label: 'Flash' },
  { value: 'vigilance', label: 'Vigilance' },
  { value: 'menace', label: 'Menace' },
  { value: 'reach', label: 'Reach' },
  { value: 'ward', label: 'Ward' },
  // Tier 3 - Nicho (~5%)
  { value: 'indestructible', label: 'Indestructible' },
  { value: 'defender', label: 'Defender' },
  { value: 'protection', label: 'Protection' },
  { value: 'prowess', label: 'Prowess' },
  { value: 'shroud', label: 'Shroud' },
]

// ============ 2. EFECTOS COMUNES (subcategorías por tipo de efecto) ============
const commonEffects = {
  removal: [
    { value: 'destroy', label: 'Destroy' },
    { value: 'exile', label: 'Exile' },
    { value: 'sacrifice', label: 'Sacrifice' },
    { value: 'counter', label: 'Counter' },
    { value: 'return to hand', label: 'Bounce' },
    { value: 'fight', label: 'Fight' },
  ],
  cardAdvantage: [
    { value: 'draw', label: 'Draw' },
    { value: 'scry', label: 'Scry' },
    { value: 'surveil', label: 'Surveil' },
    { value: 'mill', label: 'Mill' },
    { value: 'search your library', label: 'Tutor' },
    { value: 'explore', label: 'Explore' },
    { value: 'discard', label: 'Discard' },
  ],
  tokens: [
    { value: 'treasure token', label: 'Treasure' },
    { value: 'food token', label: 'Food' },
    { value: 'clue token', label: 'Clue' },
    { value: 'blood token', label: 'Blood' },
    { value: 'map token', label: 'Map' },
    { value: 'powerstone token', label: 'Powerstone' },
    { value: 'create a token', label: 'Create Token' },
  ],
  counters: [
    { value: 'proliferate', label: 'Proliferate' },
    { value: '+1/+1 counter', label: '+1/+1' },
    { value: '-1/-1 counter', label: '-1/-1' },
    { value: 'amass', label: 'Amass' },
    { value: 'bolster', label: 'Bolster' },
  ],
  control: [
    { value: 'gain control', label: 'Steal' },
    { value: 'goad', label: 'Goad' },
    { value: 'detain', label: 'Detain' },
    { value: 'tap', label: 'Tap' },
    { value: 'untap', label: 'Untap' },
  ],
}

// Flat list para búsqueda de labels
const allCommonEffects = [
  ...commonEffects.removal,
  ...commonEffects.cardAdvantage,
  ...commonEffects.tokens,
  ...commonEffects.counters,
  ...commonEffects.control,
]

// ============ 3. TRIGGERS (ordenados por frecuencia) ============
const triggerKeywords = [
  { value: 'enters the battlefield', label: 'ETB' },
  { value: 'dies', label: 'Dies' },
  { value: 'whenever ~ attacks', label: 'Attack' },
  { value: 'deals combat damage', label: 'Combat Damage' },
  { value: 'when you cast', label: 'Cast' },
  { value: 'whenever you sacrifice', label: 'Sacrifice' },
  { value: 'whenever you gain life', label: 'Lifegain' },
  { value: 'whenever a creature dies', label: 'Creature Dies' },
  { value: 'beginning of your upkeep', label: 'Upkeep' },
  { value: 'beginning of your end step', label: 'End Step' },
  { value: 'leaves the battlefield', label: 'LTB' },
]

// ============ 4. MECÁNICAS DE SET (organizadas por relevancia) ============
const setMechanics = {
  meta: [
    // Tier Meta - Competitivas actuales
    { value: 'cascade', label: 'Cascade' },
    { value: 'delve', label: 'Delve' },
    { value: 'affinity', label: 'Affinity' },
    { value: 'energy', label: 'Energy' },
    { value: 'convoke', label: 'Convoke' },
    { value: 'storm', label: 'Storm' },
    { value: 'infect', label: 'Infect' },
    { value: 'dredge', label: 'Dredge' },
  ],
  popular: [
    // Tier Popular - Clásicas queridas
    { value: 'flashback', label: 'Flashback' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'kicker', label: 'Kicker' },
    { value: 'evoke', label: 'Evoke' },
    { value: 'unearth', label: 'Unearth' },
    { value: 'madness', label: 'Madness' },
    { value: 'suspend', label: 'Suspend' },
    { value: 'escape', label: 'Escape' },
    { value: 'ninjutsu', label: 'Ninjutsu' },
    { value: 'morph', label: 'Morph' },
  ],
  recent: [
    // Tier Reciente - 2023-2025
    { value: 'discover', label: 'Discover' },
    { value: 'plot', label: 'Plot' },
    { value: 'offspring', label: 'Offspring' },
    { value: 'disguise', label: 'Disguise' },
    { value: 'bargain', label: 'Bargain' },
    { value: 'impending', label: 'Impending' },
    { value: 'toxic', label: 'Toxic' },
    { value: 'connive', label: 'Connive' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'prototype', label: 'Prototype' },
  ],
  other: [
    // Tier Otras - Alfabético
    { value: 'adapt', label: 'Adapt' },
    { value: 'alliance', label: 'Alliance' },
    { value: 'backup', label: 'Backup' },
    { value: 'casualty', label: 'Casualty' },
    { value: 'channel', label: 'Channel' },
    { value: 'cloak', label: 'Cloak' },
    { value: 'corrupted', label: 'Corrupted' },
    { value: 'domain', label: 'Domain' },
    { value: 'emerge', label: 'Emerge' },
    { value: 'evolve', label: 'Evolve' },
    { value: 'exalted', label: 'Exalted' },
    { value: 'exploit', label: 'Exploit' },
    { value: 'extort', label: 'Extort' },
    { value: 'fabricate', label: 'Fabricate' },
    { value: 'foretell', label: 'Foretell' },
    { value: 'incubate', label: 'Incubate' },
    { value: 'landfall', label: 'Landfall' },
    { value: 'mentor', label: 'Mentor' },
    { value: 'modified', label: 'Modified' },
    { value: 'monstrosity', label: 'Monstrosity' },
    { value: 'mutate', label: 'Mutate' },
    { value: 'persist', label: 'Persist' },
    { value: 'raid', label: 'Raid' },
    { value: 'reconfigure', label: 'Reconfigure' },
    { value: 'revolt', label: 'Revolt' },
    { value: 'riot', label: 'Riot' },
    { value: 'saddle', label: 'Saddle' },
    { value: 'spectacle', label: 'Spectacle' },
    { value: 'spree', label: 'Spree' },
    { value: 'survival', label: 'Survival' },
    { value: 'training', label: 'Training' },
    { value: 'undying', label: 'Undying' },
    { value: 'valiant', label: 'Valiant' },
  ],
}

// Flat list para búsqueda de labels
const allSetMechanics = [
  ...setMechanics.meta,
  ...setMechanics.popular,
  ...setMechanics.recent,
  ...setMechanics.other,
]

// ============ TIPOS ESPECIALES (incluidos en el modal pero no como acordeón separado) ============
const specialTypes = [
  { value: 'legendary', label: 'Legendary' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'aura', label: 'Aura' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'saga', label: 'Saga' },
  { value: 'modal double-faced', label: 'MDFC' },
  { value: 'transform', label: 'DFC' },
  { value: 'snow', label: 'Snow' },
]

// Métodos
const toggleColor = (color: string) => {
  const index = filters.colors!.indexOf(color)
  if (index > -1) {
    filters.colors!.splice(index, 1)
  } else {
    filters.colors!.push(color)
  }
}

const toggleType = (type: string) => {
  const index = filters.types!.indexOf(type)
  if (index > -1) {
    filters.types!.splice(index, 1)
  } else {
    filters.types!.push(type)
  }
}

const toggleRarity = (rarity: string) => {
  const index = filters.rarity!.indexOf(rarity)
  if (index > -1) {
    filters.rarity!.splice(index, 1)
  } else {
    filters.rarity!.push(rarity)
  }
}

const toggleFormat = (format: string) => {
  const index = filters.formatLegal!.indexOf(format)
  if (index > -1) {
    filters.formatLegal!.splice(index, 1)
  } else {
    filters.formatLegal!.push(format)
  }
}

const toggleKeyword = (keyword: string) => {
  const index = filters.keywords!.indexOf(keyword)
  if (index > -1) {
    filters.keywords!.splice(index, 1)
  } else {
    filters.keywords!.push(keyword)
  }
}

const handleSearch = async () => {
  await searchStore.search(filters)
}

const handleClear = () => {
  filters.name = ''
  filters.colors = []
  filters.types = []
  filters.manaValue = { min: undefined, max: undefined }
  filters.rarity = []
  filters.sets = []
  filters.power = { min: undefined, max: undefined }
  filters.toughness = { min: undefined, max: undefined }
  filters.formatLegal = []
  filters.priceUSD = { min: undefined, max: undefined }
  filters.keywords = []
  filters.isFoil = false
  filters.isFullArt = false
  searchStore.clearSearch()
}

// Contar filtros activos
const activeFilterCount = () => {
  let count = 0
  if (filters.name?.trim()) count++
  if (filters.colors?.length) count++
  if (filters.types?.length) count++
  if (filters.manaValue?.min || filters.manaValue?.max) count++
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

// Contar keywords seleccionadas por categoría
const countSelectedInCategory = (categoryKeywords: { value: string }[]) => {
  if (!filters.keywords?.length) return 0
  return categoryKeywords.filter(kw => filters.keywords!.includes(kw.value)).length
}

// Obtener label de un keyword por su valor
const getKeywordLabel = (value: string): string => {
  const allKeywords = [
    ...combatAbilities,
    ...allCommonEffects,
    ...triggerKeywords,
    ...allSetMechanics,
    ...specialTypes,
  ]
  return allKeywords.find(kw => kw.value === value)?.label || value
}

// Obtener label de color
const getColorLabel = (value: string): string => {
  return colorOptions.find(c => c.value === value)?.label || value
}

// Obtener label de tipo
const getTypeLabel = (value: string): string => {
  return typeOptions.find(t => t.value === value)?.label || value
}

// Obtener label de rareza
const getRarityLabel = (value: string): string => {
  return rarityOptions.find(r => r.value === value)?.label || value
}

// Obtener label de formato
const getFormatLabel = (value: string): string => {
  return formatOptions.find(f => f.value === value)?.label || value
}

// Remover un filtro específico
const removeFilter = (type: string, value?: string) => {
  switch (type) {
    case 'color':
      if (value) filters.colors = filters.colors?.filter(c => c !== value)
      break
    case 'type':
      if (value) filters.types = filters.types?.filter(t => t !== value)
      break
    case 'rarity':
      if (value) filters.rarity = filters.rarity?.filter(r => r !== value)
      break
    case 'format':
      if (value) filters.formatLegal = filters.formatLegal?.filter(f => f !== value)
      break
    case 'keyword':
      if (value) filters.keywords = filters.keywords?.filter(k => k !== value)
      break
    case 'manaValue':
      filters.manaValue = { min: undefined, max: undefined }
      break
    case 'power':
      filters.power = { min: undefined, max: undefined }
      break
    case 'toughness':
      filters.toughness = { min: undefined, max: undefined }
      break
    case 'priceUSD':
      filters.priceUSD = { min: undefined, max: undefined }
      break
    case 'isFoil':
      filters.isFoil = false
      break
    case 'isFullArt':
      filters.isFullArt = false
      break
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- ========== BARRA DE BÚSQUEDA HORIZONTAL ========== -->
    <div class="bg-primary border border-silver-30 p-4">
      <!-- Fila 1: Input + Botón Buscar -->
      <div class="flex gap-3 mb-4">
        <div class="relative flex-1">
          <input
              :value="filters.name"
              @input="handleNameInput(($event.target as HTMLInputElement).value)"
              @keydown.enter="handleSearch"
              :placeholder="t('search.filterPanel.placeholder')"
              type="text"
              class="w-full bg-primary border border-silver-30 px-4 py-3 text-body text-silver placeholder-silver-50 focus:border-neon focus:outline-none transition-fast"
          />
          <!-- Sugerencias dropdown -->
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 bg-primary border border-neon mt-1 max-h-48 overflow-y-auto z-20"
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
          <SpriteIcon :name="searchStore.loading ? 'loading' : 'search'" size="tiny" />
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
                'w-8 h-8 text-sm font-bold transition-fast flex items-center justify-center',
                filters.colors?.includes(color.value)
                  ? 'bg-neon text-primary border-2 border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
              :title="color.label"
          >
            {{ color.value === 'w' ? '⚪' : color.value === 'u' ? '🔵' : color.value === 'b' ? '⚫' : color.value === 'r' ? '🔴' : color.value === 'g' ? '🟢' : '◇' }}
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
          <SpriteIcon name="settings" size="tiny" />
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
        <!-- Colores -->
        <button
            v-for="color in filters.colors"
            :key="'color-' + color"
            @click="removeFilter('color', color)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          {{ getColorLabel(color) }} <span class="opacity-70">×</span>
        </button>

        <!-- Tipos -->
        <button
            v-for="type in filters.types"
            :key="'type-' + type"
            @click="removeFilter('type', type)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          {{ getTypeLabel(type) }} <span class="opacity-70">×</span>
        </button>

        <!-- Rarezas -->
        <button
            v-for="rarity in filters.rarity"
            :key="'rarity-' + rarity"
            @click="removeFilter('rarity', rarity)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          {{ getRarityLabel(rarity) }} <span class="opacity-70">×</span>
        </button>

        <!-- Formatos -->
        <button
            v-for="format in filters.formatLegal"
            :key="'format-' + format"
            @click="removeFilter('format', format)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          {{ getFormatLabel(format) }} <span class="opacity-70">×</span>
        </button>

        <!-- Keywords -->
        <button
            v-for="keyword in filters.keywords"
            :key="'keyword-' + keyword"
            @click="removeFilter('keyword', keyword)"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          {{ getKeywordLabel(keyword) }} <span class="opacity-70">×</span>
        </button>

        <!-- Mana Value -->
        <button
            v-if="filters.manaValue?.min !== undefined || filters.manaValue?.max !== undefined"
            @click="removeFilter('manaValue')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          MV: {{ filters.manaValue?.min ?? '?' }}-{{ filters.manaValue?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>

        <!-- Power -->
        <button
            v-if="filters.power?.min !== undefined || filters.power?.max !== undefined"
            @click="removeFilter('power')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          POW: {{ filters.power?.min ?? '?' }}-{{ filters.power?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>

        <!-- Toughness -->
        <button
            v-if="filters.toughness?.min !== undefined || filters.toughness?.max !== undefined"
            @click="removeFilter('toughness')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          TOU: {{ filters.toughness?.min ?? '?' }}-{{ filters.toughness?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>

        <!-- Precio USD -->
        <button
            v-if="filters.priceUSD?.min !== undefined || filters.priceUSD?.max !== undefined"
            @click="removeFilter('priceUSD')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          ${{ filters.priceUSD?.min ?? '?' }}-${{ filters.priceUSD?.max ?? '?' }} <span class="opacity-70">×</span>
        </button>

        <!-- Foil -->
        <button
            v-if="filters.isFoil"
            @click="removeFilter('isFoil')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          Foil <span class="opacity-70">×</span>
        </button>

        <!-- Full Art -->
        <button
            v-if="filters.isFullArt"
            @click="removeFilter('isFullArt')"
            class="px-2 py-1 text-tiny font-bold bg-neon text-primary flex items-center gap-1 hover:bg-rust transition-fast"
        >
          Full Art <span class="opacity-70">×</span>
        </button>
      </div>

      <!-- Indicador de auto-búsqueda -->
      <div v-if="activeFilterCount() > 0" class="mt-2 text-tiny text-silver-50">
        {{ t('search.filterPanel.autoSearch') }}
      </div>
    </div>

    <!-- ========== FILTROS AVANZADOS (Modal) ========== -->
    <BaseModal
        :show="showAdvancedFilters"
        :title="t('search.modal.title')"
        @close="showAdvancedFilters = false; filterSearchQuery = ''"
    >
      <div class="space-y-4">

      <!-- Buscador de filtros -->
      <div class="relative">
        <input
            v-model="filterSearchQuery"
            type="text"
            :placeholder="t('search.filterPanel.filterSearchPlaceholder')"
            class="w-full bg-primary border-2 border-neon px-4 py-3 text-body text-silver placeholder-silver-50 focus:outline-none"
        />
        <!-- Resultados de búsqueda -->
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
            <span
                v-if="filters.keywords?.includes(result.value)"
                class="text-neon text-tiny font-bold"
            >
              ✓
            </span>
          </button>
        </div>
        <!-- Mensaje sin resultados -->
        <div
            v-if="filterSearchQuery.length >= 2 && filterSearchResults.length === 0"
            class="absolute top-full left-0 right-0 bg-primary border-2 border-neon border-t-0 px-4 py-3 text-small text-silver-50"
        >
          {{ t('search.filterPanel.noFilterResults', { query: filterSearchQuery }) }}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Todos los tipos -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.types') }}</span>
          <div class="flex flex-wrap gap-1">
            <button
                v-for="type in typeOptions"
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
        </div>

        <!-- Mana Value -->
        <div>
          <span id="mana-value-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.manaValue') }}</span>
          <div class="flex gap-2">
            <input
                v-model.number="filters.manaValue!.min"
                type="number"
                placeholder="Min"
                aria-label="Mana Value minimum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.manaValue!.max"
                type="number"
                placeholder="Max"
                aria-label="Mana Value maximum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>

        <!-- Precio USD -->
        <div>
          <span id="price-usd-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.priceUSD') }}</span>
          <div class="flex gap-2">
            <input
                v-model.number="filters.priceUSD!.min"
                type="number"
                placeholder="Min"
                step="0.01"
                aria-label="Price USD minimum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.priceUSD!.max"
                type="number"
                placeholder="Max"
                step="0.01"
                aria-label="Price USD maximum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>

        <!-- Power -->
        <div>
          <span id="power-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.power') }}</span>
          <div class="flex gap-2">
            <input
                v-model.number="filters.power!.min"
                type="number"
                placeholder="Min"
                aria-label="Power minimum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.power!.max"
                type="number"
                placeholder="Max"
                aria-label="Power maximum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>

        <!-- Toughness -->
        <div>
          <span id="toughness-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.toughness') }}</span>
          <div class="flex gap-2">
            <input
                v-model.number="filters.toughness!.min"
                type="number"
                placeholder="Min"
                aria-label="Toughness minimum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.toughness!.max"
                type="number"
                placeholder="Max"
                aria-label="Toughness maximum"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>

        <!-- Formato Legal -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.format') }}</span>
          <div class="flex flex-wrap gap-1">
            <button
                v-for="format in formatOptions"
                :key="format.value"
                @click="toggleFormat(format.value)"
                :class="[
                  'px-2 py-1 text-tiny font-bold transition-fast',
                  filters.formatLegal?.includes(format.value)
                    ? 'bg-neon text-primary border border-neon'
                    : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
                ]"
            >
              {{ format.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- ========== ACORDEONES DE KEYWORDS (4 categorías reorganizadas) ========== -->
      <div class="border border-silver-30">

        <!-- 1. HABILIDADES DE COMBATE (más buscadas) -->
        <div class="border-b border-silver-30">
          <button
              @click="toggleAccordion('combat')"
              class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast"
          >
            <span class="text-small font-bold text-silver flex items-center gap-2">
              {{ t('search.accordions.combat') }}
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(combatAbilities) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">
                {{ countSelectedInCategory(combatAbilities) }}
              </span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('combat') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('combat')" class="px-3 py-2 bg-silver-10/50">
            <!-- Tier 1: Más comunes -->
            <div class="flex flex-wrap gap-1 mb-2">
              <button
                  v-for="keyword in combatAbilities.slice(0, 6)"
                  :key="keyword.value"
                  @click="toggleKeyword(keyword.value)"
                  :class="[
                    'px-2 py-1 text-tiny font-bold transition-fast',
                    filters.keywords?.includes(keyword.value)
                      ? 'bg-neon text-primary border border-neon'
                      : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                  ]"
              >
                {{ keyword.label }}
              </button>
            </div>
            <!-- Tier 2-3: Menos comunes -->
            <div class="flex flex-wrap gap-1 pt-2 border-t border-silver-30/50">
              <button
                  v-for="keyword in combatAbilities.slice(6)"
                  :key="keyword.value"
                  @click="toggleKeyword(keyword.value)"
                  :class="[
                    'px-2 py-1 text-tiny font-bold transition-fast',
                    filters.keywords?.includes(keyword.value)
                      ? 'bg-neon text-primary border border-neon'
                      : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                  ]"
              >
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 2. EFECTOS COMUNES (con subcategorías) -->
        <div class="border-b border-silver-30">
          <button
              @click="toggleAccordion('effects')"
              class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast"
          >
            <span class="text-small font-bold text-silver">
              {{ t('search.accordions.effects') }}
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(allCommonEffects) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">
                {{ countSelectedInCategory(allCommonEffects) }}
              </span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('effects') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('effects')" class="px-3 py-2 bg-silver-10/50 space-y-3">
            <!-- Remoción -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.effectCategories.removal') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in commonEffects.removal"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Card Advantage -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.effectCategories.cardAdvantage') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in commonEffects.cardAdvantage"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Tokens -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.effectCategories.tokens') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in commonEffects.tokens"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Contadores -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.effectCategories.counters') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in commonEffects.counters"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Control -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.effectCategories.control') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in commonEffects.control"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. TRIGGERS -->
        <div class="border-b border-silver-30">
          <button
              @click="toggleAccordion('triggers')"
              class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast"
          >
            <span class="text-small font-bold text-silver">
              {{ t('search.accordions.triggers') }}
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(triggerKeywords) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">
                {{ countSelectedInCategory(triggerKeywords) }}
              </span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('triggers') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('triggers')" class="px-3 py-2 bg-silver-10/50">
            <div class="flex flex-wrap gap-1">
              <button
                  v-for="keyword in triggerKeywords"
                  :key="keyword.value"
                  @click="toggleKeyword(keyword.value)"
                  :class="[
                    'px-2 py-1 text-tiny font-bold transition-fast',
                    filters.keywords?.includes(keyword.value)
                      ? 'bg-neon text-primary border border-neon'
                      : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                  ]"
              >
                {{ keyword.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 4. MECÁNICAS DE SET (con subcategorías por relevancia) -->
        <div>
          <button
              @click="toggleAccordion('setMechanics')"
              class="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-silver-10 transition-fast"
          >
            <span class="text-small font-bold text-silver">
              {{ t('search.accordions.setMechanics') }}
            </span>
            <span class="flex items-center gap-2">
              <span v-if="countSelectedInCategory(allSetMechanics) > 0" class="bg-neon text-primary px-2 py-0.5 text-tiny font-bold">
                {{ countSelectedInCategory(allSetMechanics) }}
              </span>
              <span class="text-silver-50 transition-transform" :class="{ 'rotate-180': isAccordionOpen('setMechanics') }">▼</span>
            </span>
          </button>
          <div v-if="isAccordionOpen('setMechanics')" class="px-3 py-2 bg-silver-10/50 space-y-3">
            <!-- Meta -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.mechanicCategories.meta') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in setMechanics.meta"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Popular -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.mechanicCategories.popular') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in setMechanics.popular"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Recientes -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.mechanicCategories.recent') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in setMechanics.recent"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
            <!-- Otras -->
            <div>
              <span class="text-tiny text-silver-50 uppercase block mb-1">{{ t('search.mechanicCategories.other') }}</span>
              <div class="flex flex-wrap gap-1">
                <button
                    v-for="keyword in setMechanics.other"
                    :key="keyword.value"
                    @click="toggleKeyword(keyword.value)"
                    :class="[
                      'px-2 py-1 text-tiny font-bold transition-fast',
                      filters.keywords?.includes(keyword.value)
                        ? 'bg-neon text-primary border border-neon'
                        : 'bg-primary border border-silver-30 text-silver hover:border-neon'
                    ]"
                >
                  {{ keyword.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tipos Especiales (fuera de acordeón, siempre visible) -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">{{ t('search.modal.sections.specialTypes') }}</span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="keyword in specialTypes"
              :key="keyword.value"
              @click="toggleKeyword(keyword.value)"
              :class="[
                'px-2 py-1 text-tiny font-bold transition-fast',
                filters.keywords?.includes(keyword.value)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ keyword.label }}
          </button>
        </div>
      </div>

      <!-- Opciones especiales -->
      <div class="flex gap-4 pt-2 border-t border-silver-30">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="filters.isFoil" type="checkbox" class="w-4 h-4" />
          <span>{{ t('search.modal.options.foilOnly') }}</span>
        </label>
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="filters.isFullArt" type="checkbox" class="w-4 h-4" />
          <span>{{ t('search.modal.options.fullArt') }}</span>
        </label>
      </div>

      <!-- Botón aplicar filtros -->
      <div class="flex justify-end pt-4 border-t border-silver-30">
        <BaseButton @click="showAdvancedFilters = false">
          {{ t('search.modal.apply') }}
        </BaseButton>
      </div>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
/* Scrollbar personalizado */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(238, 238, 238, 0.2);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(238, 238, 238, 0.4);
}

/* Animación de rotación para acordeones */
.rotate-180 {
  transform: rotate(180deg);
}

.transition-transform {
  transition: transform 150ms ease-out;
}
</style>