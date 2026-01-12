<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { searchCards } from '../../services/scryfall'
import CardGridSearch from '../common/CardGridSearch.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { DeckCard } from '../../types/deck'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  add: [card: Omit<DeckCard, 'id' | 'addedAt'>]
}>()

const toastStore = useToastStore()
const gridSearchRef = ref()
const selectedCard = ref<any>(null)
const showForm = ref(false)

const form = ref({
  quantity: 1,
  condition: 'NM' as const,
  foil: false,
  isInSideboard: false,
})

const conditionOptions = [
  { value: 'M', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'LP', label: 'Light Play (LP)' },
  { value: 'MP', label: 'Moderate Play (MP)' },
  { value: 'HP', label: 'Heavy Play (HP)' },
  { value: 'PO', label: 'Poor (PO)' },
]

const handleCardSelected = (card: any) => {
  selectedCard.value = card
  showForm.value = true
}

const handleAdd = () => {
  if (!selectedCard.value) {
    toastStore.showToast('Selecciona una carta', 'error')
    return
  }

  const cardData = {
    scryfallId: selectedCard.value.id,
    name: selectedCard.value.name,
    edition: selectedCard.value.set.toUpperCase(),
    quantity: form.value.quantity,
    condition: form.value.condition,
    foil: form.value.foil,
    isInSideboard: form.value.isInSideboard,
    price: selectedCard.value.prices?.usd ? parseFloat(selectedCard.value.prices.usd) : 0,
    image: selectedCard.value.image_uris?.small || '',
  }

  emit('add', cardData)
  resetForm()
  toastStore.showToast(`✓ "${selectedCard.value.name}" agregada`, 'success')
}

const resetForm = () => {
  selectedCard.value = null
  showForm.value = false
  gridSearchRef.value?.resetSearch()
  form.value = {
    quantity: 1,
    condition: 'NM',
    foil: false,
    isInSideboard: false,
  }
}

const deselectCard = () => {
  selectedCard.value = null
  showForm.value = false
}

watch(() => props.show, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-6 w-full max-h-[80vh] flex flex-col">
      <!-- Card Search Grid -->
      <template v-if="!showForm">
        <CardGridSearch
            ref="gridSearchRef"
            title="AGREGAR CARTA AL DECK"
            subtitle="Busca y selecciona una carta de la grilla"
            placeholder="Ej: Black Lotus, Ragavan, Counterspell..."
            :onSearch="searchCards"
            :maxResults="12"
            :showPrice="true"
            @cardSelected="handleCardSelected"
        >
          <template #footer="{ results }">
            <BaseButton
                class="w-full"
                @click="emit('close')"
            >
              CERRAR
            </BaseButton>
          </template>
        </CardGridSearch>
      </template>

      <!-- Selected Card Form -->
      <template v-else>
        <div class="space-y-6 flex flex-col h-full">
          <!-- Title -->
          <div>
            <h2 class="text-h2 font-bold text-silver mb-1">DETALLES DE CARTA</h2>
            <p class="text-small text-silver-70">Configura cómo deseas agregar esta carta</p>
          </div>

          <!-- Card Details -->
          <div class="flex-1 overflow-y-auto">
            <div class="bg-secondary border border-silver-30 p-4 space-y-4 rounded">
              <div class="flex gap-4">
                <!-- Card Image -->
                <div class="flex-shrink-0">
                  <img
                      v-if="selectedCard.image_uris?.small"
                      :src="selectedCard.image_uris.small"
                      :alt="selectedCard.name"
                      class="w-32 h-44 object-cover border border-silver-30"
                  />
                  <div v-else class="w-32 h-44 bg-primary border border-silver-30 flex items-center justify-center">
                    <span class="text-tiny text-silver-50">No image</span>
                  </div>
                </div>

                <!-- Card Info & Form -->
                <div class="flex-1 space-y-4">
                  <!-- Card Details -->
                  <div>
                    <p class="font-bold text-silver mb-1 text-h3">{{ selectedCard.name }}</p>
                    <p class="text-small text-silver-70 mb-2">{{ selectedCard.set.toUpperCase() }}</p>
                    <p class="text-h2 font-bold text-neon">
                      ${{ selectedCard.prices?.usd ? parseFloat(selectedCard.prices.usd).toFixed(2) : 'N/A' }}
                    </p>
                  </div>

                  <!-- Form Fields -->
                  <div class="space-y-3 border-t border-silver-20 pt-4">
                    <!-- Quantity & Condition -->
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-tiny text-silver-70 block mb-1">Cantidad</label>
                        <input
                            v-model.number="form.quantity"
                            type="number"
                            min="1"
                            max="4"
                            class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-mono text-small focus:outline-none focus:border-neon transition-150"
                        />
                      </div>

                      <div>
                        <label class="text-tiny text-silver-70 block mb-1">Condición</label>
                        <BaseSelect
                            v-model="form.condition"
                            :options="conditionOptions"
                        />
                      </div>
                    </div>

                    <!-- Checkboxes -->
                    <div class="space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
                        <input v-model="form.foil" type="checkbox" class="w-4 h-4" />
                        <span class="text-small text-silver">Foil</span>
                      </label>

                      <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
                        <input v-model="form.isInSideboard" type="checkbox" class="w-4 h-4" />
                        <span class="text-small text-silver">Sideboard</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-4 border-t border-silver-20">
            <BaseButton
                class="flex-1"
                @click="handleAdd"
            >
              ✓ AGREGAR CARTA
            </BaseButton>
            <BaseButton
                variant="secondary"
                class="flex-1"
                @click="deselectCard"
            >
              ← VOLVER
            </BaseButton>
          </div>
        </div>
      </template>
    </div>
  </BaseModal>
</template>