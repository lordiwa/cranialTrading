<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useSearchStore, type FilterOptions } from '../../stores/search'
import { getCardSuggestions } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'

const searchStore = useSearchStore()
const showAdvancedFilters = ref(false) // Toggle filtros avanzados

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

// ============ HABILIDADES EVERGREEN (siempre disponibles) ============
const evergreenKeywords = [
  { value: 'flying', label: 'Flying' },
  { value: 'first strike', label: 'First Strike' },
  { value: 'double strike', label: 'Double Strike' },
  { value: 'deathtouch', label: 'Deathtouch' },
  { value: 'defender', label: 'Defender' },
  { value: 'flash', label: 'Flash' },
  { value: 'haste', label: 'Haste' },
  { value: 'hexproof', label: 'Hexproof' },
  { value: 'indestructible', label: 'Indestructible' },
  { value: 'lifelink', label: 'Lifelink' },
  { value: 'menace', label: 'Menace' },
  { value: 'reach', label: 'Reach' },
  { value: 'trample', label: 'Trample' },
  { value: 'vigilance', label: 'Vigilance' },
  { value: 'ward', label: 'Ward' },
  { value: 'equip', label: 'Equip' },
  { value: 'enchant', label: 'Enchant' },
  { value: 'protection', label: 'Protection' },
  { value: 'prowess', label: 'Prowess' },
  { value: 'shroud', label: 'Shroud' },
]

// ============ MECÁNICAS COMPETITIVAS 2022-2025 (Tier 1) ============
const competitiveMechanics = [
  { value: 'energy', label: 'Energy' },
  { value: 'discover', label: 'Discover' },
  { value: 'toxic', label: 'Toxic' },
  { value: 'domain', label: 'Domain' },
  { value: 'channel', label: 'Channel' },
  { value: 'plot', label: 'Plot' },
  { value: 'connive', label: 'Connive' },
  { value: 'cascade', label: 'Cascade' },
  { value: 'affinity', label: 'Affinity' },
  { value: 'delve', label: 'Delve' },
  { value: 'convoke', label: 'Convoke' },
  { value: 'infect', label: 'Infect' },
  { value: 'dredge', label: 'Dredge' },
  { value: 'storm', label: 'Storm' },
]

// ============ MECÁNICAS DE SET POPULARES ============
const setMechanics = [
  // Tier 2 - Muy populares
  { value: 'offspring', label: 'Offspring' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'backup', label: 'Backup' },
  { value: 'reconfigure', label: 'Reconfigure' },
  { value: 'prototype', label: 'Prototype' },
  { value: 'disguise', label: 'Disguise' },
  { value: 'cloak', label: 'Cloak' },
  { value: 'impending', label: 'Impending' },
  // Clásicas populares
  { value: 'cycling', label: 'Cycling' },
  { value: 'flashback', label: 'Flashback' },
  { value: 'kicker', label: 'Kicker' },
  { value: 'madness', label: 'Madness' },
  { value: 'suspend', label: 'Suspend' },
  { value: 'escape', label: 'Escape' },
  { value: 'foretell', label: 'Foretell' },
  { value: 'morph', label: 'Morph' },
  { value: 'mutate', label: 'Mutate' },
  { value: 'ninjutsu', label: 'Ninjutsu' },
  { value: 'evoke', label: 'Evoke' },
  { value: 'emerge', label: 'Emerge' },
  { value: 'unearth', label: 'Unearth' },
  { value: 'persist', label: 'Persist' },
  { value: 'undying', label: 'Undying' },
  // Tier 3 - Útiles
  { value: 'alliance', label: 'Alliance' },
  { value: 'casualty', label: 'Casualty' },
  { value: 'bargain', label: 'Bargain' },
  { value: 'incubate', label: 'Incubate' },
  { value: 'saddle', label: 'Saddle' },
  { value: 'spree', label: 'Spree' },
  { value: 'valiant', label: 'Valiant' },
  { value: 'survival', label: 'Survival' },
  { value: 'corrupted', label: 'Corrupted' },
  { value: 'modified', label: 'Modified' },
  { value: 'exploit', label: 'Exploit' },
  { value: 'extort', label: 'Extort' },
  { value: 'exalted', label: 'Exalted' },
  { value: 'evolve', label: 'Evolve' },
  { value: 'fabricate', label: 'Fabricate' },
  { value: 'landfall', label: 'Landfall' },
  { value: 'raid', label: 'Raid' },
  { value: 'revolt', label: 'Revolt' },
  { value: 'spectacle', label: 'Spectacle' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'training', label: 'Training' },
  { value: 'riot', label: 'Riot' },
  { value: 'adapt', label: 'Adapt' },
  { value: 'monstrosity', label: 'Monstrosity' },
]

// ============ KEYWORD ACTIONS (Acciones oficiales Rule 701) ============
const keywordActions = [
  // Manipulación de biblioteca
  { value: 'surveil', label: 'Surveil' },
  { value: 'explore', label: 'Explore' },
  { value: 'scry', label: 'Scry' },
  { value: 'mill', label: 'Mill' },
  { value: 'search your library', label: 'Tutor' },
  { value: 'shuffle', label: 'Shuffle' },
  { value: 'reveal', label: 'Reveal' },
  { value: 'manifest', label: 'Manifest' },
  { value: 'transform', label: 'Transform' },
  // Interacción con permanentes
  { value: 'destroy', label: 'Destroy' },
  { value: 'exile', label: 'Exile' },
  { value: 'sacrifice', label: 'Sacrifice' },
  { value: 'fight', label: 'Fight' },
  { value: 'goad', label: 'Goad' },
  { value: 'detain', label: 'Detain' },
  { value: 'exert', label: 'Exert' },
  { value: 'tap', label: 'Tap' },
  { value: 'untap', label: 'Untap' },
  // Contadores
  { value: 'proliferate', label: 'Proliferate' },
  { value: 'bolster', label: 'Bolster' },
  { value: 'support', label: 'Support' },
  { value: 'amass', label: 'Amass' },
  // Cartas en mano
  { value: 'draw', label: 'Draw' },
  { value: 'discard', label: 'Discard' },
  { value: 'counter', label: 'Counter' },
  { value: 'return to hand', label: 'Bounce' },
  { value: 'gain control', label: 'Steal' },
]

// ============ TRIGGERS (Disparadores) ============
const triggerKeywords = [
  { value: 'enters the battlefield', label: 'ETB' },
  { value: 'dies', label: 'Dies' },
  { value: 'leaves the battlefield', label: 'LTB' },
  { value: 'beginning of your upkeep', label: 'Upkeep' },
  { value: 'beginning of your end step', label: 'End Step' },
  { value: 'whenever ~ attacks', label: 'Attack Trigger' },
  { value: 'deals combat damage', label: 'Combat Damage' },
  { value: 'when you cast', label: 'Cast Trigger' },
  { value: 'whenever you gain life', label: 'Lifegain' },
  { value: 'whenever you sacrifice', label: 'Sacrifice Trigger' },
  { value: 'whenever a creature dies', label: 'Creature Dies' },
]

// ============ TOKENS ============
const tokenKeywords = [
  { value: 'treasure token', label: 'Treasure' },
  { value: 'clue token', label: 'Clue' },
  { value: 'food token', label: 'Food' },
  { value: 'blood token', label: 'Blood' },
  { value: 'map token', label: 'Map' },
  { value: 'powerstone token', label: 'Powerstone' },
  { value: 'create a token', label: 'Create Token' },
  { value: 'populate', label: 'Populate' },
]

// ============ TIPOS ESPECIALES ============
const specialTypes = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'crew', label: 'Crew' },
  { value: 'saga', label: 'Saga' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'aura', label: 'Aura' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'snow', label: 'Snow' },
  { value: 'modal double-faced', label: 'MDFC' },
  { value: 'transform', label: 'DFC Transform' },
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
              placeholder="Buscar carta por nombre..."
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
            class="px-6"
        >
          {{ searchStore.loading ? '⏳' : '🔍 BUSCAR' }}
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
              'px-3 py-1 text-tiny font-bold transition-fast flex items-center gap-1',
              showAdvancedFilters || activeFilterCount() > 3
                ? 'bg-neon-10 border border-neon text-neon'
                : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
            ]"
        >
          ⚙️ MÁS
          <span v-if="activeFilterCount() > 0" class="bg-neon text-primary px-1 rounded text-tiny">{{ activeFilterCount() }}</span>
        </button>

        <!-- Limpiar -->
        <button
            v-if="activeFilterCount() > 0"
            @click="handleClear"
            class="px-3 py-1 text-tiny font-bold text-rust border border-rust hover:bg-rust hover:text-primary transition-fast"
        >
          ✕ LIMPIAR
        </button>
      </div>

      <!-- Indicador de auto-búsqueda -->
      <div v-if="activeFilterCount() > 0" class="mt-2 text-tiny text-silver-50">
        Los filtros se aplicarán automáticamente en 0.5 segundos
      </div>
    </div>

    <!-- ========== FILTROS AVANZADOS (Colapsable) ========== -->
    <div
        v-if="showAdvancedFilters"
        class="bg-primary border border-silver-30 p-4 space-y-4"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Todos los tipos -->
        <div>
          <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">Tipos</span>
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
          <span id="mana-value-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">Mana Value</span>
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
          <span id="price-usd-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">Precio USD</span>
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
          <span id="power-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">Power</span>
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
          <span id="toughness-label" class="text-tiny font-bold text-silver-70 uppercase block mb-2">Toughness</span>
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
          <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">Formato</span>
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

      <!-- Habilidades Evergreen -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">⚔️ Habilidades Evergreen</span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="keyword in evergreenKeywords"
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

      <!-- Mecánicas Competitivas -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">🏆 Mecánicas Competitivas (Tier 1)</span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="keyword in competitiveMechanics"
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

      <!-- Mecánicas de Set -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">🎴 Mecánicas de Set</span>
        <div class="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          <button
              v-for="keyword in setMechanics"
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

      <!-- Keyword Actions -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">📜 Acciones (Rule 701)</span>
        <div class="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          <button
              v-for="keyword in keywordActions"
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

      <!-- Triggers -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">⚡ Triggers</span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="keyword in triggerKeywords"
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

      <!-- Tokens -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">🪙 Tokens</span>
        <div class="flex flex-wrap gap-1">
          <button
              v-for="keyword in tokenKeywords"
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

      <!-- Tipos Especiales -->
      <div>
        <span class="text-tiny font-bold text-silver-70 uppercase block mb-2">✨ Tipos Especiales</span>
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
          <span>Solo Foil</span>
        </label>
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="filters.isFullArt" type="checkbox" class="w-4 h-4" />
          <span>Full Art</span>
        </label>
      </div>
    </div>
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
</style>