<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { debounce } from 'lodash-es'
import BaseInput from '../ui/BaseInput.vue'
import BaseLoader from '../ui/BaseLoader.vue'

interface CardGridSearchProps {
  title: string
  subtitle: string
  placeholder?: string
  maxResults?: number
  showPrice?: boolean
}

const props = withDefaults(defineProps<CardGridSearchProps>(), {
  placeholder: 'Busca una carta...',
  maxResults: 12,
  showPrice: true,
})

const emit = defineEmits<{
  cardSelected: [card: any]
  searchChanged: [query: string, results: any[]]
  search: [query: string]
}>()

const searchQuery = ref('')
const searchResults = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// ✅ NUEVO: Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref<Record<string, number>>({})

// ✅ NUEVO: Función para obtener el precio de una carta
const getCardPrice = (card: any): number | null => {
  if (card.prices?.usd) {
    const price = Number.parseFloat(card.prices.usd)
    return Number.isNaN(price) ? null : price
  }
  return null
}

// ✅ NUEVO: Filtrar y ordenar cartas por precio
const sortedAndFilteredResults = computed(() => {
  const cardsWithPrice = searchResults.value.filter(card => {
    const price = getCardPrice(card)
    return price !== null && price > 0
  })

  // Si hay cartas con precio válido, mostrar solo esas
  // Si no, mostrar todas (incluyendo sin precio)
  return cardsWithPrice.length > 0 ? cardsWithPrice : searchResults.value
})

// Computed para limitar resultados
const displayResults = computed(() =>
    sortedAndFilteredResults.value.slice(0, props.maxResults)
)

// ✅ NUEVO: Detectar split cards
const isSplitCard = (card: any): boolean => {
  return card.card_faces && card.card_faces.length > 1
}

// ✅ NUEVO: Obtener imagen correcta según split card
const getCardImage = (card: any): string => {
  if (isSplitCard(card)) {
    const faceIndex = cardFaceIndex.value[card.id] || 0
    return card.card_faces[faceIndex]?.image_uris?.small || card.card_faces[0]?.image_uris?.small || ''
  }
  // Carta normal
  return card.image_uris?.small || ''
}

// ✅ NUEVO: Toggle entre lados de split card
const toggleCardFace = (cardId: string) => {
  const currentIndex = cardFaceIndex.value[cardId] || 0
  const newIndex = currentIndex === 0 ? 1 : 0
  cardFaceIndex.value[cardId] = newIndex
}

// Debounced search function
const performSearch = debounce(async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    loading.value = false
    error.value = null
    emit('searchChanged', '', [])
    return
  }

  loading.value = true
  error.value = null

  // Emit search event - parent will call setResults() and setLoading(false)
  emit('search', searchQuery.value)
}, 300)

const handleCardClick = (card: any) => {
  emit('cardSelected', card)
}

watch(searchQuery, performSearch)

// Exponer métodos
defineExpose({
  resetSearch: () => {
    searchQuery.value = ''
    searchResults.value = []
    cardFaceIndex.value = {}
  },
  getSelectedQuery: () => searchQuery.value,
  setResults: (results: any[]) => {
    searchResults.value = results
    cardFaceIndex.value = {}
    emit('searchChanged', searchQuery.value, results)
  },
  setLoading: (isLoading: boolean) => {
    loading.value = isLoading
  },
  setError: (err: string | null) => {
    error.value = err
  },
})
</script>

<template>
  <div class="space-y-6 flex flex-col h-full">
    <!-- Header -->
    <div>
      <h2 class="text-h2 font-bold text-silver mb-1">{{ title }}</h2>
      <p class="text-small text-silver-70">{{ subtitle }}</p>
    </div>

    <!-- Search Input -->
    <div>
      <label for="card-grid-search" class="text-small text-silver-70 block mb-2">Buscar Carta</label>
      <BaseInput
          id="card-grid-search"
          v-model="searchQuery"
          :placeholder="placeholder"
          type="text"
          autofocus
      />
    </div>

    <!-- Content Area (scrollable) -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-48">
        <BaseLoader size="small" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex justify-center items-center h-48">
        <div class="text-center">
          <p class="text-small text-rust mb-2">⚠️ Error</p>
          <p class="text-tiny text-silver-70">{{ error }}</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="searchQuery && searchResults.length === 0" class="flex justify-center items-center h-48">
        <div class="text-center">
          <p class="text-small text-silver-70">No se encontraron resultados</p>
          <p class="text-tiny text-silver-70 mt-1">para "{{ searchQuery }}"</p>
        </div>
      </div>

      <!-- No Search State -->
      <div v-else-if="!searchQuery" class="flex justify-center items-center h-48">
        <p class="text-small text-silver-70">Escribe el nombre de una carta</p>
      </div>

      <!-- Grid of Cards -->
      <div v-else class="space-y-4">
        <p class="text-tiny text-silver-70">
          {{ displayResults.length }}
          <span v-if="displayResults.length < sortedAndFilteredResults.length">
            de {{ sortedAndFilteredResults.length }}
          </span>
          resultados
        </p>

        <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <button
              v-for="card in displayResults"
              :key="`${card.id}-${card.set}`"
              @click="handleCardClick(card)"
              class="group cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neon"
          >
            <!-- Card Image Container -->
            <div class="relative aspect-[3/4] bg-secondary border border-silver-30 overflow-hidden group-hover:border-neon transition-150">
              <img
                  v-if="getCardImage(card)"
                  :src="getCardImage(card)"
                  :alt="card.name"
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
                No image
              </div>

              <!-- ✅ NUEVO: Toggle button para split cards -->
              <button
                  v-if="isSplitCard(card)"
                  @click.stop="toggleCardFace(card.id)"
                  class="absolute top-1 left-1 bg-primary border border-neon px-1 py-0.5 text-tiny font-bold text-neon hover:bg-neon-10 transition-all"
                  title="Click para ver el otro lado"
                  aria-label="Ver otro lado de la carta"
              >
                ↔️
              </button>
            </div>

            <!-- Card Info -->
            <div class="mt-2 space-y-1">
              <p class="text-tiny font-bold text-silver line-clamp-2 group-hover:text-neon transition-colors">
                {{ card.name }}
              </p>
              <p class="text-tiny text-silver-70">
                {{ card.set.toUpperCase() }}
              </p>
              <p v-if="showPrice" class="text-tiny font-bold text-neon">
                ${{ card.prices?.usd ? Number.parseFloat(card.prices.usd).toFixed(2) : 'N/A' }}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Slot para footer customizable -->
    <div class="border-t border-silver-20 pt-4">
      <slot name="footer" :results="displayResults" :query="searchQuery" />
    </div>
  </div>
</template>

<style scoped>
/* Smooth scroll behavior */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #666666;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #888888;
}
</style>