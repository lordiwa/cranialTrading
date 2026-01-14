<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useSearchStore, type FilterOptions } from '../../stores/search'
import { getCardSuggestions } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseBadge from '../ui/BaseBadge.vue'

const searchStore = useSearchStore()
const showFilters = ref(true) // Toggle en mobile

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

// ✅ NUEVO: Sugerencias de nombres
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
let suggestionTimeout: ReturnType<typeof setTimeout>

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

const keywordOptions = [
  { value: 'flying', label: 'Flying' },
  { value: 'haste', label: 'Haste' },
  { value: 'lifelink', label: 'Lifelink' },
  { value: 'trample', label: 'Trample' },
  { value: 'deathtouch', label: 'Deathtouch' },
  { value: 'hexproof', label: 'Hexproof' },
  { value: 'indestructible', label: 'Indestructible' },
  { value: 'draw', label: 'Draw' },
  { value: 'discard', label: 'Discard' },
  { value: 'sacrifice', label: 'Sacrifice' },
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
  <div class="space-y-md">
    <!-- Toggle button (mobile only) -->
    <button
        @click="showFilters = !showFilters"
        class="lg:hidden w-full bg-primary border border-silver px-4 py-3 text-small font-bold text-silver flex items-center justify-between hover:border-neon transition-fast"
    >
      <span>⚙️ FILTROS{{ activeFilterCount() > 0 ? ` (${activeFilterCount()})` : '' }}</span>
      <span>{{ showFilters ? '▼' : '▶' }}</span>
    </button>

    <!-- Filters panel -->
    <div
        v-if="showFilters"
        class="bg-primary border border-silver-30 p-md space-y-md max-h-[calc(100vh-200px)] overflow-y-auto"
    >
      <!-- Nombre -->
      <div class="relative">
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Nombre</label>
        <input
            :value="filters.name"
            @input="handleNameInput(($event.target as HTMLInputElement).value)"
            placeholder="Black Lotus, Counterspell..."
            type="text"
            class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none transition-fast"
        />

        <!-- ✅ Sugerencias dropdown -->
        <div
            v-if="showSuggestions && suggestions.length > 0"
            class="absolute top-full left-0 right-0 bg-primary border border-neon mt-1 max-h-48 overflow-y-auto z-10"
        >
          <div
              v-for="suggestion in suggestions"
              :key="suggestion"
              @click="selectSuggestion(suggestion)"
              class="px-3 py-2 hover:bg-neon-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-fast"
          >
            {{ suggestion }}
          </div>
        </div>
      </div>

      <!-- Colores -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Colores</label>
        <div class="flex flex-wrap gap-2">
          <button
              v-for="color in colorOptions"
              :key="color.value"
              @click="toggleColor(color.value)"
              :class="[
                'px-3 py-2 text-tiny font-bold transition-fast',
                filters.colors?.includes(color.value)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ color.label }}
          </button>
        </div>
      </div>

      <!-- Tipos -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Tipos</label>
        <div class="flex flex-wrap gap-2">
          <button
              v-for="type in typeOptions"
              :key="type.value"
              @click="toggleType(type.value)"
              :class="[
                'px-3 py-2 text-tiny font-bold transition-fast',
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
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Mana Value</label>
        <div class="grid grid-cols-2 gap-2">
          <input
              v-model.number="filters.manaValue!.min"
              type="number"
              placeholder="Min"
              class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
          />
          <input
              v-model.number="filters.manaValue!.max"
              type="number"
              placeholder="Max"
              class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
          />
        </div>
        <label class="flex items-center gap-2 mt-2 text-small text-silver cursor-pointer">
          <input
              v-model="filters.manaValue!.even"
              type="checkbox"
              class="w-4 h-4"
          />
          <span>Solo números pares</span>
        </label>
      </div>

      <!-- Rarity -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Rareza</label>
        <div class="flex flex-wrap gap-2">
          <button
              v-for="rarity in rarityOptions"
              :key="rarity.value"
              @click="toggleRarity(rarity.value)"
              :class="[
                'px-3 py-2 text-tiny font-bold transition-fast',
                filters.rarity?.includes(rarity.value)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ rarity.label }}
          </button>
        </div>
      </div>

      <!-- Power / Toughness -->
      <div class="grid grid-cols-2 gap-md">
        <div>
          <label class="text-small font-bold text-silver-70 uppercase block mb-2">Power</label>
          <div class="flex gap-2">
            <input
                v-model.number="filters.power!.min"
                type="number"
                placeholder="Min"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.power!.max"
                type="number"
                placeholder="Max"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label class="text-small font-bold text-silver-70 uppercase block mb-2">Toughness</label>
          <div class="flex gap-2">
            <input
                v-model.number="filters.toughness!.min"
                type="number"
                placeholder="Min"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
            <input
                v-model.number="filters.toughness!.max"
                type="number"
                placeholder="Max"
                class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
            />
          </div>
        </div>
      </div>

      <!-- Precio USD -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Precio USD</label>
        <div class="grid grid-cols-2 gap-2">
          <input
              v-model.number="filters.priceUSD!.min"
              type="number"
              placeholder="Min"
              step="0.01"
              class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
          />
          <input
              v-model.number="filters.priceUSD!.max"
              type="number"
              placeholder="Max"
              step="0.01"
              class="w-full bg-primary border border-silver-30 px-2 py-1 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none"
          />
        </div>
      </div>

      <!-- Formato Legal -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Formato Legal</label>
        <div class="flex flex-wrap gap-2">
          <button
              v-for="format in formatOptions"
              :key="format.value"
              @click="toggleFormat(format.value)"
              :class="[
                'px-3 py-2 text-tiny font-bold transition-fast',
                filters.formatLegal?.includes(format.value)
                  ? 'bg-neon text-primary border border-neon'
                  : 'bg-silver-10 border border-silver-30 text-silver hover:border-neon'
              ]"
          >
            {{ format.label }}
          </button>
        </div>
      </div>

      <!-- Keywords -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Habilidades</label>
        <div class="grid grid-cols-2 gap-2">
          <button
              v-for="keyword in keywordOptions"
              :key="keyword.value"
              @click="toggleKeyword(keyword.value)"
              :class="[
                'px-3 py-2 text-tiny font-bold transition-fast',
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
      <div class="space-y-2">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input
              v-model="filters.isFoil"
              type="checkbox"
              class="w-4 h-4"
          />
          <span>Solo Foil</span>
        </label>
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input
              v-model="filters.isFullArt"
              type="checkbox"
              class="w-4 h-4"
          />
          <span>Full Art</span>
        </label>
      </div>

      <!-- Botones de acción -->
      <div class="flex gap-2 pt-4 border-t border-silver-30">
        <BaseButton
            @click="handleSearch"
            :disabled="searchStore.loading"
            class="flex-1"
        >
          {{ searchStore.loading ? '🔍 BUSCANDO...' : '🔍 BUSCAR' }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            @click="handleClear"
            :disabled="searchStore.loading"
            class="flex-1"
        >
          LIMPIAR
        </BaseButton>
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