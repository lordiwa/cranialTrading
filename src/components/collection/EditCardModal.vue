<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useConfirmStore } from '../../stores/confirm'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { type CardHistoryPoint, usePriceHistory } from '../../composables/usePriceHistory'
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

// ========== PRICE HISTORY CHART ==========
const { loadCardHistory } = usePriceHistory()
const showPriceChart = ref(false)
const chartHistory = ref<CardHistoryPoint[]>([])
const chartLoading = ref(false)
type ChartSource = 'tcg' | 'ck' | 'buylist'
const chartSource = ref<ChartSource>('tcg')

const chartHasData = computed(() => chartHistory.value.length >= 2)

const chartSourceColor = computed(() => {
  if (chartSource.value === 'ck') return '#4CAF50'
  if (chartSource.value === 'buylist') return '#FF9800'
  return '#CCFF00'
})

const chartData = computed(() => {
  return chartHistory.value.map(p => ({
    date: p.date,
    value: chartSource.value === 'ck' ? p.ck : chartSource.value === 'buylist' ? p.buylist : p.tcg,
  }))
})

const chartMinMax = computed(() => {
  if (!chartHasData.value) return { min: 0, max: 100 }
  const values = chartData.value.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min) * 0.1 || 1
  return { min: min - padding, max: max + padding }
})

const chartSvgW = 300
const chartSvgH = 100
const chartPad = { top: 8, right: 8, bottom: 16, left: 8 }

const chartPolyline = computed(() => {
  if (!chartHasData.value) return ''
  const { min, max } = chartMinMax.value
  const plotW = chartSvgW - chartPad.left - chartPad.right
  const plotH = chartSvgH - chartPad.top - chartPad.bottom
  const data = chartData.value
  return data.map((d, i) => {
    const x = chartPad.left + (i / (data.length - 1)) * plotW
    const y = chartPad.top + plotH - ((d.value - min) / (max - min)) * plotH
    return `${x},${y}`
  }).join(' ')
})

const chartFirstDate = computed(() => {
  const first = chartData.value[0]
  if (!first) return ''
  const [, m, d] = first.date.split('-')
  return `${m}/${d}`
})

const chartLastDate = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!last) return ''
  const [, m, d] = last.date.split('-')
  return `${m}/${d}`
})

const chartLastValue = computed(() => {
  const last = chartData.value[chartData.value.length - 1]
  if (!last) return ''
  return `$${last.value.toFixed(2)}`
})

async function togglePriceChart() {
  if (showPriceChart.value) {
    showPriceChart.value = false
    return
  }
  if (chartHistory.value.length === 0 && props.card?.scryfallId) {
    chartLoading.value = true
    try {
      chartHistory.value = await loadCardHistory(props.card.scryfallId)
    } catch {
      // silent
    } finally {
      chartLoading.value = false
    }
  }
  showPriceChart.value = true
}

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
  showPriceChart.value = false
  chartHistory.value = []
  chartSource.value = 'tcg'
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

            <!-- Price History Toggle -->
            <div class="mt-2">
              <button
                @click="togglePriceChart"
                class="flex items-center gap-1 text-tiny text-silver-50 hover:text-silver transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span>{{ t('cards.detailModal.priceHistory.toggle') }}</span>
                <span class="text-[14px]">{{ showPriceChart ? '▲' : '▼' }}</span>
              </button>

              <!-- Chart panel -->
              <div v-if="showPriceChart" class="mt-2">
                <div v-if="chartLoading" class="flex items-center justify-center h-[60px]">
                  <span class="text-tiny text-silver-50 animate-pulse">...</span>
                </div>
                <div v-else-if="!chartHasData" class="text-tiny text-silver-50 py-2">
                  {{ t('cards.detailModal.priceHistory.noData') }}
                </div>
                <div v-else>
                  <!-- Source selector -->
                  <div class="flex items-center gap-1 mb-1">
                    <button
                      v-for="src in (['tcg', 'ck', 'buylist'] as ChartSource[])"
                      :key="src"
                      @click="chartSource = src"
                      :class="[
                        'px-1.5 py-0.5 text-[14px] font-bold rounded transition-colors uppercase',
                        chartSource === src
                          ? src === 'tcg' ? 'bg-neon text-primary' : src === 'ck' ? 'bg-[#4CAF50] text-primary' : 'bg-[#FF9800] text-primary'
                          : 'text-silver-50 hover:text-silver hover:bg-silver-5'
                      ]"
                    >
                      {{ src === 'tcg' ? 'TCG' : src === 'ck' ? 'CK' : 'BUY' }}
                    </button>
                  </div>

                  <!-- SVG Chart -->
                  <svg
                    :viewBox="`0 0 ${chartSvgW} ${chartSvgH}`"
                    class="w-full h-[100px]"
                    preserveAspectRatio="none"
                  >
                    <line
                      :x1="chartPad.left" :y1="chartPad.top"
                      :x2="chartSvgW - chartPad.right" :y2="chartPad.top"
                      stroke="#333" stroke-width="0.5"
                    />
                    <line
                      :x1="chartPad.left" :y1="chartSvgH - chartPad.bottom"
                      :x2="chartSvgW - chartPad.right" :y2="chartSvgH - chartPad.bottom"
                      stroke="#333" stroke-width="0.5"
                    />
                    <polyline
                      :points="chartPolyline"
                      fill="none"
                      :stroke="chartSourceColor"
                      stroke-width="2"
                      stroke-linejoin="round"
                      stroke-linecap="round"
                    />
                  </svg>

                  <!-- Labels -->
                  <div class="flex items-center justify-between text-[14px] text-silver-50 -mt-1">
                    <span>{{ chartFirstDate }}</span>
                    <span class="font-bold" :style="{ color: chartSourceColor }">{{ chartLastValue }}</span>
                    <span>{{ chartLastDate }}</span>
                  </div>
                </div>
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
                class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon transition-150 rounded"
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
