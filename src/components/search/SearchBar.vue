<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { getCardSuggestions, searchCards } from '../../services/scryfall'
import { useToastStore } from '../../stores/toast'
import BaseInput from '../ui/BaseInput.vue'
import BaseButton from '../ui/BaseButton.vue'
import SvgIcon from '../ui/SvgIcon.vue'

const emit = defineEmits<{
  'add-card': [card: any]
}>()
const { t } = useI18n()
const toastStore = useToastStore()

const searchQuery = ref('')
const suggestions = ref<string[]>([])
const loading = ref(false)
const showSuggestions = ref(false)

// Obtener sugerencias mientras escribes
const handleInput = async (value: string | number) => {
  const strValue = String(value)
  searchQuery.value = strValue

  if (strValue.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  loading.value = true
  try {
    const results = await getCardSuggestions(strValue)
    suggestions.value = results.slice(0, 10) // Top 10
    showSuggestions.value = true
  } catch (err) {
    console.error('Error al obtener sugerencias:', err)
    suggestions.value = []
  } finally {
    loading.value = false
  }
}

// Seleccionar sugerencia
const selectSuggestion = async (cardName: string) => {
  searchQuery.value = cardName
  showSuggestions.value = false
  await handleSearch()
}

// Buscar cartas
const handleSearch = async () => {
  if (!searchQuery.value.trim()) return

  loading.value = true
  try {
    const results = await searchCards(searchQuery.value)

    if (results.length > 0) {
      // Mostrar modal para seleccionar edición
      showSelectCardModal.value = true
      availableCards.value = results
    } else {
      toastStore.show(t('search.bar.noCardsFound'), 'info')
    }
  } catch (err) {
    console.error('Error al buscar:', err)
    toastStore.show(t('search.bar.searchError'), 'error')
  } finally {
    loading.value = false
  }
}

// Modal para seleccionar edición
const showSelectCardModal = ref(false)
const availableCards = ref<any[]>([])

const selectCard = (card: any) => {
  emit('add-card', card)
  showSelectCardModal.value = false
  searchQuery.value = ''
  suggestions.value = []
}
</script>

<template>
  <div class="space-y-4">
    <!-- Buscador principal -->
    <div class="relative">
      <div class="flex gap-2">
        <div class="flex-1 relative">
          <BaseInput
              :model-value="searchQuery"
              @update:model-value="handleInput"
              @keyup.enter="handleSearch"
              :placeholder="t('search.bar.placeholder')"
              type="text"
              class="w-full"
          />

          <!-- Sugerencias dropdown -->
          <div
              v-if="showSuggestions && suggestions.length > 0"
              class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-10 rounded"
          >
            <div
                v-for="suggestion in suggestions"
                :key="suggestion"
                @click="selectSuggestion(suggestion)"
                class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-fast"
            >
              {{ suggestion }}
            </div>
          </div>
        </div>

        <BaseButton
            @click="handleSearch"
            :disabled="!searchQuery.trim() || loading"
            class="whitespace-nowrap flex items-center gap-2"
        >
          <SvgIcon :name="loading ? 'loading' : 'search'" size="tiny" />
          {{ loading ? '' : t('search.bar.searchButton') }}
        </BaseButton>
      </div>
    </div>

    <!-- Modal: Seleccionar edición -->
    <div
        v-if="showSelectCardModal"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-primary border border-silver-30 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4 rounded-lg">
        <h2 class="text-lg font-bold text-silver mb-4">
          {{ t('search.bar.selectEdition', { name: searchQuery }) }}
        </h2>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div
              v-for="card in availableCards"
              :key="`${card.id}-${card.set}`"
              @click="selectCard(card)"
              class="border border-silver-30 p-3 hover:border-neon cursor-pointer transition-fast rounded"
          >
            <img
                v-if="card.image_uris?.normal"
                :src="card.image_uris.normal"
                :alt="card.name"
                class="w-full aspect-[3/4] object-cover mb-2"
            />
            <p class="text-tiny text-silver-70">{{ card.set_name }}</p>
            <p class="text-tiny text-neon">${{ card.prices?.usd || 'N/A' }}</p>
          </div>
        </div>

        <BaseButton
            variant="secondary"
            @click="showSelectCardModal = false"
            class="w-full"
        >
          {{ t('common.actions.close') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transition-fast {
  transition: all 150ms ease-out;
}
</style>