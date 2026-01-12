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

// Computed para limitar resultados
const displayResults = computed(() =>
    searchResults.value.slice(0, props.maxResults)
)

// Debounced search function
const performSearch = debounce(async () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    emit('searchChanged', '', [])
    return
  }

  loading.value = true
  error.value = null

  try {
    // ✅ Emitir evento en lugar de llamar callback
    emit('search', searchQuery.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error en la búsqueda'
    searchResults.value = []
  } finally {
    loading.value = false
  }
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
  },
  getSelectedQuery: () => searchQuery.value,
  setResults: (results: any[]) => {
    searchResults.value = results
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
      <label class="text-small text-silver-70 block mb-2">Buscar Carta</label>
      <BaseInput
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
          <span v-if="displayResults.length < searchResults.length">
            de {{ searchResults.length }}
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
                  v-if="card.image_uris?.small"
                  :src="card.image_uris.small"
                  :alt="card.name"
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
                No image
              </div>
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
                ${{ card.prices?.usd ? parseFloat(card.prices.usd).toFixed(2) : 'N/A' }}
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