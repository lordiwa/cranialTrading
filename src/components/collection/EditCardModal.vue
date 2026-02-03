<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useConfirmStore } from '../../stores/confirm'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { Card } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  save: [card: Card]
}>()

const { t } = useI18n()

const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { getCardAllocationSummary, checkQuantityReduction } = useCardAllocation()

// Card Kingdom prices
const {
  loading: loadingCKPrices,
  cardKingdomRetail,
  cardKingdomBuylist,
  hasCardKingdomPrices,
  fetchPrices: fetchCKPrices,
  formatPrice,
} = useCardPrices(
  () => selectedPrint.value?.id,
  () => selectedPrint.value?.set
)

const form = ref<Partial<Card>>({
  quantity: 1,
  condition: 'NM',
  foil: false,
})

const isLoading = ref(false)
const showZoom = ref(false)

// Prints disponibles
const availablePrints = ref<any[]>([])
const selectedPrint = ref<any>(null)
const loadingPrints = ref(false)

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

// Allocation summary for this card
const allocationSummary = computed(() => {
  if (!props.card) return null
  return getCardAllocationSummary(props.card.id)
})

// Check if reducing quantity would affect allocations
const quantityReductionCheck = computed(() => {
  if (!props.card || !form.value.quantity) return null
  return checkQuantityReduction(props.card.id, form.value.quantity)
})

// Warning message if reducing below allocated
const quantityWarning = computed(() => {
  if (!quantityReductionCheck.value) return null
  if (!quantityReductionCheck.value.canReduce && quantityReductionCheck.value.excessAmount > 0) {
    return t('cards.editModal.quantityWarning', { excess: quantityReductionCheck.value.excessAmount })
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

// Fetch CK prices when print changes
watch(selectedPrint, (print) => {
  if (print?.id && print?.set) {
    fetchCKPrices()
  }
})

// Obtener imagen actual
const currentImage = computed(() => {
  if (selectedPrint.value) {
    return selectedPrint.value.image_uris?.normal ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.normal || ''
  }
  return props.card?.image || ''
})

// Large image for zoom view
const zoomImage = computed(() => {
  if (selectedPrint.value) {
    return selectedPrint.value.image_uris?.large ||
           selectedPrint.value.image_uris?.normal ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.large ||
           selectedPrint.value.card_faces?.[0]?.image_uris?.normal || ''
  }
  return props.card?.image || ''
})

// Obtener precio actual
const currentPrice = computed(() => {
  if (selectedPrint.value?.prices?.usd) {
    return Number.parseFloat(selectedPrint.value.prices.usd)
  }
  return props.card?.price || 0
})

const handleSave = async () => {
  if (!props.card) return

  if ((form.value.quantity!) < 1) {
    toastStore.show(t('cards.detailModal.quantityMin'), 'error')
    return
  }

  // Warn about quantity reduction affecting allocations
  if (quantityWarning.value) {
    const confirmed = await confirmStore.show({
      title: 'Reducir cantidad',
      message: quantityWarning.value + '\n\n¿Deseas continuar?',
      confirmText: 'CONTINUAR',
      cancelText: 'CANCELAR',
      confirmVariant: 'danger'
    })
    if (!confirmed) return
  }

  isLoading.value = true

  try {
    const updatedCard: Card = {
      ...props.card,
      quantity: form.value.quantity!,
      condition: form.value.condition!,
      foil: form.value.foil!,
      // Actualizar con el print seleccionado
      scryfallId: selectedPrint.value?.id || props.card.scryfallId,
      edition: selectedPrint.value?.set_name || props.card.edition,
      setCode: selectedPrint.value?.set || props.card.setCode,
      price: currentPrice.value,
      image: currentImage.value,
    }

    emit('save', updatedCard)
  } catch (err) {
    toastStore.show(t('collection.messages.updateError'), 'error')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const handleClose = () => {
  availablePrints.value = []
  selectedPrint.value = null
  showZoom.value = false
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" @close="handleClose">
    <div class="space-y-6 w-full max-w-xl">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">{{ t('cards.editModal.title') }}</h2>
        <p class="text-small text-silver-70">{{ t('cards.editModal.subtitle') }}</p>
      </div>

      <!-- Card Preview -->
      <div v-if="card" class="flex flex-col sm:flex-row gap-4">
        <!-- Image (clickable for zoom) -->
        <div class="flex-shrink-0 mx-auto sm:mx-0">
          <button
              v-if="currentImage"
              @click="showZoom = true"
              class="relative group cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-neon rounded"
          >
            <img
                :src="currentImage"
                :alt="card.name"
                class="w-28 sm:w-32 aspect-[2/3] object-cover border border-silver-30 rounded group-hover:border-neon transition-colors"
            />
            <div class="absolute inset-0 bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
              <span class="text-tiny text-silver font-bold">🔍 Zoom</span>
            </div>
          </button>
          <div v-else class="w-28 sm:w-32 aspect-[2/3] bg-primary border border-silver-30 flex items-center justify-center rounded">
            <span class="text-tiny text-silver-50">{{ t('cards.detailModal.noImage') }}</span>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 space-y-3">
          <div>
            <p class="font-bold text-silver text-h3">{{ card.name }}</p>
            <!-- Multi-source prices -->
            <div class="mt-2 space-y-1">
              <div class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">TCGPlayer:</span>
                <span class="text-body font-bold text-neon">${{ currentPrice.toFixed(2) }}</span>
              </div>
              <div v-if="hasCardKingdomPrices" class="flex justify-between items-center">
                <span class="text-tiny text-silver-70">Card Kingdom:</span>
                <span class="text-body font-bold text-[#4CAF50]">{{ formatPrice(cardKingdomRetail) }}</span>
              </div>
              <div v-if="cardKingdomBuylist" class="flex justify-between items-center">
                <span class="text-tiny text-silver-50">CK Buylist:</span>
                <span class="text-small text-[#FF9800]">{{ formatPrice(cardKingdomBuylist) }}</span>
              </div>
              <div v-else-if="loadingCKPrices" class="text-tiny text-silver-50">
                {{ t('cards.editModal.loadingPrices') }}
              </div>
            </div>
          </div>

          <!-- Print Selector -->
          <div v-if="availablePrints.length > 1">
            <label for="edit-print-select" class="text-tiny text-silver-70 block mb-1">{{ t('cards.addModal.editionLabel') }}</label>
            <select
                id="edit-print-select"
                :value="selectedPrint?.id"
                @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-mono text-small focus:outline-none focus:border-neon transition-150 rounded"
            >
              <option
                  v-for="print in availablePrints"
                  :key="print.id"
                  :value="print.id"
              >
                {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
              </option>
            </select>
            <p class="text-tiny text-silver-50 mt-1">{{ t('cards.addModal.printsAvailable', { count: availablePrints.length }) }}</p>
          </div>
          <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('cards.editModal.loadingPrints') }}</p>
          <p v-else class="text-small text-silver-70">{{ card.edition }}</p>
        </div>
      </div>

      <!-- Allocation Summary -->
      <div v-if="allocationSummary && allocationSummary.allocations.length > 0" class="bg-secondary border border-silver-30 p-4 rounded">
        <p class="text-tiny text-silver-70 mb-2">{{ t('cards.editModal.allocations.title') }}</p>
        <div class="flex flex-wrap gap-2">
          <div
              v-for="alloc in allocationSummary.allocations"
              :key="alloc.deckId"
              class="px-2 py-1 bg-primary border border-neon-30 text-small"
          >
            <span class="text-neon font-bold">{{ alloc.quantity }}</span>
            <span class="text-silver ml-1">{{ t('cards.editModal.allocations.inDeck', { qty: '', deckName: alloc.deckName }).replace('{qty}', '') }}</span>
            <span v-if="alloc.isInSideboard" class="text-silver-50 ml-1">{{ t('cards.editModal.allocations.sideboard') }}</span>
          </div>
        </div>
        <p class="text-tiny text-silver-50 mt-2">
          {{ t('cards.editModal.allocations.total', { allocated: allocationSummary.allocated, available: allocationSummary.available }) }}
        </p>
      </div>

      <!-- Form -->
      <div class="bg-secondary border border-silver-30 p-4 space-y-4 rounded">
        <!-- Quantity & Condition -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="edit-quantity" class="text-small text-silver-70 block mb-2">{{ t('cards.addModal.quantityLabel') }}</label>
            <BaseInput
                id="edit-quantity"
                :model-value="form.quantity ?? 1"
                @update:model-value="(v) => form.quantity = Number(v)"
                type="number"
                min="1"
            />
            <!-- Warning about reducing quantity -->
            <p v-if="quantityWarning" class="text-tiny text-amber mt-1">
              {{ quantityWarning }}
            </p>
          </div>

          <div>
            <label for="edit-condition" class="text-small text-silver-70 block mb-2">{{ t('cards.addModal.conditionLabel') }}</label>
            <BaseSelect
                id="edit-condition"
                :model-value="form.condition ?? 'NM'"
                @update:model-value="(v) => form.condition = v as Card['condition']"
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
          <span class="text-small text-silver">{{ t('cards.addModal.foilLabel') }}</span>
        </label>

        <!-- Info about collection sync -->
        <p v-if="allocationSummary && allocationSummary.allocations.length > 0" class="text-tiny text-silver-50 border-t border-silver-20 pt-3">
          {{ t('cards.editModal.note') }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            :disabled="isLoading"
            @click="handleSave"
        >
          {{ isLoading ? t('common.actions.saving') : t('cards.editModal.submit') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            :disabled="isLoading"
            @click="handleClose"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
      </div>
    </div>

    <!-- Zoom Overlay -->
    <Teleport to="body">
      <div
          v-if="showZoom"
          class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out p-4"
          @click="showZoom = false"
      >
        <img
            :src="zoomImage"
            :alt="card?.name"
            class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            @click.stop
        />
        <button
            @click="showZoom = false"
            class="absolute top-4 right-4 text-silver hover:text-neon transition-colors p-2"
            aria-label="Cerrar zoom"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-silver-70 text-small">
          Click para cerrar
        </p>
      </div>
    </Teleport>
  </BaseModal>
</template>

<style scoped>
.border-neon-30 {
  border-color: rgba(0, 255, 136, 0.3);
}
</style>
