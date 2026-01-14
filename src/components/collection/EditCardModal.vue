<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { searchCards } from '../../services/scryfall'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { Card, CardCondition, CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  save: [card: Card]
}>()

const toastStore = useToastStore()
const { getCardAllocationSummary, checkQuantityReduction } = useCardAllocation()

// Helper: Limpiar nombre de carta (remover set code y collector number)
const cleanCardName = (name: string): string => {
  return name.replace(/\s*\([A-Z0-9]+\)\s*\d+[a-z]?\s*$/i, '').trim()
}

const form = ref<Partial<Card>>({
  quantity: 1,
  condition: 'NM',
  foil: false,
})

const isLoading = ref(false)

// Prints disponibles
const availablePrints = ref<any[]>([])
const selectedPrint = ref<any>(null)
const loadingPrints = ref(false)

const conditionOptions = [
  { value: 'M', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'LP', label: 'Light Play (LP)' },
  { value: 'MP', label: 'Moderate Play (MP)' },
  { value: 'HP', label: 'Heavy Play (HP)' },
  { value: 'PO', label: 'Poor (PO)' },
]

// Allocation summary for this card
const allocationSummary = computed(() => {
  if (!props.card) return null
  return getCardAllocationSummary(props.card.id)
})

// Check if reducing quantity would affect allocations
const quantityReductionCheck = computed(() => {
  if (!props.card || !form.value.quantity) return null
  return checkQuantityReduction(props.card.id, form.value.quantity as number)
})

// Warning message if reducing below allocated
const quantityWarning = computed(() => {
  if (!quantityReductionCheck.value) return null
  if (!quantityReductionCheck.value.canReduce && quantityReductionCheck.value.excessAmount > 0) {
    return `Esta carta está asignada a ${quantityReductionCheck.value.currentAllocated} copias en mazos. Reducir a ${form.value.quantity} moverá ${quantityReductionCheck.value.excessAmount} copia(s) a wishlist.`
  }
  return null
})

// Cargar prints cuando se abre el modal
watch(() => props.show, async (show) => {
  if (show && props.card) {
    // Inicializar formulario
    form.value = {
      quantity: props.card.quantity,
      condition: props.card.condition,
      foil: props.card.foil,
    }

    // Cargar todos los prints disponibles
    loadingPrints.value = true
    try {
      const cardName = cleanCardName(props.card.name)
      const results = await searchCards(`!"${cardName}"`)
      availablePrints.value = results

      // Buscar el print actual
      const currentPrint = results.find(p => p.id === props.card!.scryfallId)
      selectedPrint.value = currentPrint || results[0] || null
    } catch (err) {
      console.error('Error loading prints:', err)
      availablePrints.value = []
    } finally {
      loadingPrints.value = false
    }
  }
}, { immediate: true })

// Cambiar print seleccionado
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedPrint.value = newPrint
  }
}

// Obtener imagen actual
const currentImage = computed(() => {
  if (selectedPrint.value) {
    return selectedPrint.value.image_uris?.normal ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.normal || ''
  }
  return props.card?.image || ''
})

// Obtener precio actual
const currentPrice = computed(() => {
  if (selectedPrint.value?.prices?.usd) {
    return parseFloat(selectedPrint.value.prices.usd)
  }
  return props.card?.price || 0
})

const handleSave = async () => {
  if (!props.card) return

  if ((form.value.quantity as number) < 1) {
    toastStore.show('Cantidad debe ser al menos 1', 'error')
    return
  }

  // Warn about quantity reduction affecting allocations
  if (quantityWarning.value) {
    if (!confirm(quantityWarning.value + '\n\n¿Deseas continuar?')) {
      return
    }
  }

  isLoading.value = true

  try {
    const updatedCard: Card = {
      ...props.card,
      quantity: form.value.quantity as number,
      condition: form.value.condition as CardCondition,
      foil: form.value.foil as boolean,
      // Actualizar con el print seleccionado
      scryfallId: selectedPrint.value?.id || props.card.scryfallId,
      edition: selectedPrint.value?.set_name || props.card.edition,
      price: currentPrice.value,
      image: currentImage.value,
    }

    emit('save', updatedCard)
  } catch (err) {
    toastStore.show('Error guardando cambios', 'error')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const handleClose = () => {
  availablePrints.value = []
  selectedPrint.value = null
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" @close="handleClose">
    <div class="space-y-6 w-full max-w-xl">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">EDITAR CARTA</h2>
        <p class="text-small text-silver-70">Modifica los detalles de tu carta</p>
      </div>

      <!-- Card Preview -->
      <div v-if="card" class="flex gap-4">
        <!-- Image -->
        <div class="flex-shrink-0">
          <img
              v-if="currentImage"
              :src="currentImage"
              :alt="card.name"
              class="w-32 h-44 object-cover border border-silver-30"
          />
          <div v-else class="w-32 h-44 bg-primary border border-silver-30 flex items-center justify-center">
            <span class="text-tiny text-silver-50">No image</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 space-y-3">
          <div>
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>
            <p class="text-h2 font-bold text-neon mt-1">${{ currentPrice.toFixed(2) }}</p>
          </div>

          <!-- Print Selector -->
          <div v-if="availablePrints.length > 1">
            <label class="text-tiny text-silver-70 block mb-1">Edición / Print</label>
            <select
                :value="selectedPrint?.id"
                @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-mono text-small focus:outline-none focus:border-neon transition-150"
            >
              <option
                  v-for="print in availablePrints"
                  :key="print.id"
                  :value="print.id"
              >
                {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
              </option>
            </select>
            <p class="text-tiny text-silver-50 mt-1">{{ availablePrints.length }} prints disponibles</p>
          </div>
          <p v-else-if="loadingPrints" class="text-tiny text-silver-50">Cargando prints...</p>
          <p v-else class="text-small text-silver-70">{{ card.edition }}</p>
        </div>
      </div>

      <!-- Allocation Summary -->
      <div v-if="allocationSummary && allocationSummary.allocations.length > 0" class="bg-secondary border border-silver-30 p-4">
        <p class="text-tiny text-silver-70 mb-2">ASIGNADA EN MAZOS</p>
        <div class="flex flex-wrap gap-2">
          <div
              v-for="alloc in allocationSummary.allocations"
              :key="alloc.deckId"
              class="px-2 py-1 bg-primary border border-neon-30 text-small"
          >
            <span class="text-neon font-bold">{{ alloc.quantity }}</span>
            <span class="text-silver ml-1">en {{ alloc.deckName }}</span>
            <span v-if="alloc.isInSideboard" class="text-silver-50 ml-1">(SB)</span>
          </div>
        </div>
        <p class="text-tiny text-silver-50 mt-2">
          Total: {{ allocationSummary.allocated }} asignada(s), {{ allocationSummary.available }} disponible(s)
        </p>
      </div>

      <!-- Form -->
      <div class="bg-secondary border border-silver-30 p-4 space-y-4">
        <!-- Quantity & Condition -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-small text-silver-70 block mb-2">Cantidad</label>
            <BaseInput
                v-model.number="form.quantity"
                type="number"
                min="1"
            />
            <!-- Warning about reducing quantity -->
            <p v-if="quantityWarning" class="text-tiny text-amber mt-1">
              {{ quantityWarning }}
            </p>
          </div>

          <div>
            <label class="text-small text-silver-70 block mb-2">Condición</label>
            <BaseSelect
                v-model="form.condition"
                :options="conditionOptions"
            />
          </div>
        </div>

        <!-- Foil Checkbox -->
        <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
          <input
              v-model="form.foil"
              type="checkbox"
              class="w-4 h-4 cursor-pointer"
          />
          <span class="text-small text-silver">Foil</span>
        </label>

        <!-- Info about collection sync -->
        <p v-if="allocationSummary && allocationSummary.allocations.length > 0" class="text-tiny text-silver-50 border-t border-silver-20 pt-3">
          Los cambios se reflejarán en todos los mazos que usan esta carta.
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            :disabled="isLoading"
            @click="handleSave"
        >
          {{ isLoading ? 'GUARDANDO...' : 'GUARDAR CAMBIOS' }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            :disabled="isLoading"
            @click="handleClose"
        >
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(0, 255, 136, 0.3);
}
</style>
