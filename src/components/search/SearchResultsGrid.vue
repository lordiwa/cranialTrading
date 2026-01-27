<script setup lang="ts">
import { computed } from 'vue'
import { useSearchStore } from '../../stores/search'
import BaseLoader from '../ui/BaseLoader.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseBadge from '../ui/BaseBadge.vue'

const searchStore = useSearchStore()

const emit = defineEmits<{
  'add-to-collection': [card: any]
  'add-preference': [card: any]
}>()

const cards = computed(() => searchStore.results)
const loading = computed(() => searchStore.loading)
const totalResults = computed(() => searchStore.totalResults)
const hasResults = computed(() => searchStore.hasResults && !loading.value)

const handleAddToCollection = async (card: any) => {
  emit('add-to-collection', card)
}

const handleAddAsPreference = (card: any) => {
  emit('add-preference', card)
}

const getConditionBadgeVariant = (rarity: string): 'busco' | 'cambio' | 'vendo' => {
  switch (rarity?.toLowerCase()) {
    case 'mythic':
    case 'rare':
      return 'busco'
    case 'uncommon':
      return 'cambio'
    default:
      return 'vendo'
  }
}

const formatPrice = (price: string | null | undefined): string => {
  if (!price) return 'N/A'
  try {
    return `$${Number.parseFloat(price).toFixed(2)}`
  } catch {
    return 'N/A'
  }
}
</script>

<template>
  <div class="w-full">
    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center py-16">
      <BaseLoader size="large" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasResults && searchStore.lastQuery" class="border border-silver-30 p-8 md:p-12 text-center">
      <p class="text-body text-silver-70 mb-2">📭 No se encontraron cartas</p>
      <p class="text-small text-silver-50">
        Intenta ajustar los filtros o realizar una búsqueda más general
      </p>
    </div>

    <!-- No search state -->
    <div v-else-if="!hasResults && !searchStore.lastQuery" class="border border-silver-30 p-8 md:p-12 text-center">
      <p class="text-body text-silver-70">🔍 Configura los filtros y busca cartas</p>
    </div>

    <!-- Results grid -->
    <div v-else class="space-y-lg">
      <!-- Results header -->
      <div class="bg-primary border border-silver-30 p-md flex items-center justify-between">
        <p class="text-small font-bold text-silver">
          {{ totalResults }} cartas encontradas
        </p>
        <p class="text-tiny text-silver-50">
          Mostrando los resultados más relevantes
        </p>
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-md">
        <div
            v-for="card in cards"
            :key="`${card.id}-${card.set}`"
            class="bg-primary border border-silver-30 p-md hover:border-neon transition-fast"
        >
          <!-- Card image -->
          <div v-if="card.image_uris?.normal" class="mb-md">
            <img
                :src="card.image_uris.normal"
                :alt="card.name"
                class="w-full aspect-[3/4] object-cover border border-silver-20"
            />
          </div>

          <!-- Card info -->
          <div class="space-y-sm">
            <!-- Name -->
            <p class="text-small md:text-body font-bold text-silver line-clamp-2">
              {{ card.name }}
            </p>

            <!-- Set & Rarity -->
            <div class="flex items-center gap-2">
              <BaseBadge :variant="getConditionBadgeVariant(card.rarity)">
                {{ card.rarity }}
              </BaseBadge>
              <p class="text-tiny text-silver-70">{{ card.set_name }}</p>
            </div>

            <!-- Price -->
            <p class="text-body font-bold text-neon">
              {{ formatPrice(card.prices?.usd) }}
            </p>

            <!-- Actions -->
            <div class="flex flex-col gap-2 pt-md border-t border-silver-20">
              <BaseButton
                  size="small"
                  @click="handleAddToCollection(card)"
                  class="w-full"
              >
                ➕ AGREGAR
              </BaseButton>
              <BaseButton
                  variant="secondary"
                  size="small"
                  @click="handleAddAsPreference(card)"
                  class="w-full"
              >
                ⭐ PREFERENCIA
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Load more hint -->
      <div class="text-center pt-4 border-t border-silver-20">
        <p class="text-tiny text-silver-50">
          Mostrando {{ totalResults }} de los resultados más relevantes
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>