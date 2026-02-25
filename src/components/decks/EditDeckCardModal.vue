<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { DisplayDeckCard } from '../../types/deck'
import type { CardCondition } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: DisplayDeckCard | null
  deckId: string
}>()

const emit = defineEmits<{
  close: []
  save: [data: {
    // For owned cards
    scryfallId?: string
    edition?: string
    quantity: number
    condition: CardCondition
    foil: boolean
    price: number
    image: string
  }]
}>()

const { t } = useI18n()

const toastStore = useToastStore()
const { getCardAllocationSummary } = useCardAllocation()

// Estado del formulario
const form = ref({
  quantity: 1,
  condition: 'NM' as CardCondition,
  foil: false,
})

// Prints disponibles
const availablePrints = ref<any[]>([])
const selectedPrint = ref<any>(null)
const loadingPrints = ref(false)

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

// Fetch CK prices when print changes
watch(selectedPrint, (print) => {
  if (print?.id && print?.set) {
    fetchCKPrices()
  }
})

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

// Check if card is owned (from collection) or wishlist
const isOwnedCard = computed(() => props.card && !props.card.isWishlist)
const isWishlistCard = computed(() => props.card?.isWishlist)

// For owned cards, get allocation info
const allocationSummary = computed(() => {
  if (!props.card || props.card.isWishlist) return null
  return getCardAllocationSummary((props.card).cardId)
})

// Max quantity for owned cards
const maxQuantityForOwned = computed(() => {
  if (!allocationSummary.value) return 99
  // Available = total owned - allocated to other decks + current allocation in this deck
  const currentAllocation = props.card && !props.card.isWishlist
      ? (props.card).allocatedQuantity
      : 0
  return allocationSummary.value.available + currentAllocation
})

// Cargar prints cuando se abre el modal con una carta
watch(() => props.card, async (card) => {
  if (card && props.show) {
    // Inicializar formulario con datos actuales
    const qty = card.isWishlist ? card.requestedQuantity : (card).allocatedQuantity
    form.value = {
      quantity: qty,
      condition: card.condition,
      foil: card.foil,
    }

    // Cargar todos los prints disponibles
    loadingPrints.value = true
    try {
      const cardName = cleanCardName(card.name)
      const results = await searchCards(`!"${cardName}"`)
      availablePrints.value = results

      // Seleccionar el print actual si está en la lista
      const currentPrint = results.find(p => p.id === card.scryfallId)
      selectedPrint.value = currentPrint || results[0] || null
    } catch (err) {
      console.error('Error loading prints:', err)
      availablePrints.value = []
    } finally {
      loadingPrints.value = false
    }
  }
}, { immediate: true })

// También recargar cuando show cambia a true
watch(() => props.show, async (show) => {
  if (show && props.card) {
    const qty = props.card.isWishlist
        ? props.card.requestedQuantity
        : (props.card).allocatedQuantity

    form.value = {
      quantity: qty,
      condition: props.card.condition,
      foil: props.card.foil,
    }

    loadingPrints.value = true
    try {
      const cardName = cleanCardName(props.card.name)
      const results = await searchCards(`!"${cardName}"`)
      availablePrints.value = results
      const currentPrint = results.find(p => p.id === props.card!.scryfallId)
      selectedPrint.value = currentPrint || results[0] || null
    } catch {
      availablePrints.value = []
    } finally {
      loadingPrints.value = false
    }
  }
})

// Cambiar print seleccionado
const handlePrintChange = (scryfallId: string) => {
  const newPrint = availablePrints.value.find(p => p.id === scryfallId)
  if (newPrint) {
    selectedPrint.value = newPrint
  }
}

// Obtener imagen actual
const currentImage = computed(() => {
  if (!selectedPrint.value) return props.card?.image || ''
  return selectedPrint.value.image_uris?.normal ||
      selectedPrint.value.card_faces?.[0]?.image_uris?.normal || ''
})

// Obtener precio actual
const currentPrice = computed(() => {
  if (!selectedPrint.value) return props.card?.price || 0
  return selectedPrint.value.prices?.usd ? Number.parseFloat(selectedPrint.value.prices.usd) : 0
})

const handleSave = () => {
  if (!props.card) return

  // Validate quantity for owned cards
  if (isOwnedCard.value && form.value.quantity > maxQuantityForOwned.value) {
    toastStore.show(t('decks.editDeckCard.onlyAvailable', { max: maxQuantityForOwned.value }), 'error')
    return
  }

  if (form.value.quantity < 1) {
    toastStore.show(t('decks.editDeckCard.quantityMin'), 'error')
    return
  }

  const updatedData = {
    scryfallId: selectedPrint.value?.id || props.card.scryfallId,
    edition: selectedPrint.value?.set?.toUpperCase() || props.card.edition,
    quantity: form.value.quantity,
    condition: form.value.condition,
    foil: form.value.foil,
    price: currentPrice.value,
    image: currentImage.value,
  }

  emit('save', updatedData)
}

const handleClose = () => {
  availablePrints.value = []
  selectedPrint.value = null
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="handleClose" :close-on-click-outside="false">
    <div class="space-y-6 w-full">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">
          {{ isWishlistCard ? t('decks.editDeckCard.titleWishlist') : t('decks.editDeckCard.titleOwned') }}
        </h2>
        <p class="text-small text-silver-70">
          <template v-if="isOwnedCard">
            {{ t('decks.editDeckCard.subtitleOwned') }}
          </template>
          <template v-else>
            {{ t('decks.editDeckCard.subtitleWishlist') }}
          </template>
        </p>
      </div>

      <div v-if="card" class="space-y-4">
        <!-- Card Preview -->
        <div class="flex gap-4">
          <!-- Image -->
          <div class="flex-shrink-0">
            <img
                v-if="currentImage"
                :src="currentImage"
                :alt="card.name"
                class="w-32 h-44 object-cover border border-silver-30"
            />
            <div v-else class="w-32 h-44 bg-primary border border-silver-30 flex items-center justify-center">
              <span class="text-tiny text-silver-50">{{ t('decks.addToDeck.noImage') }}</span>
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 space-y-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <p class="font-bold text-silver text-h3">{{ card.name }}</p>
                <span
                    v-if="isWishlistCard"
                    class="px-2 py-0.5 text-tiny bg-amber-10 border border-amber text-amber"
                >
                  WISHLIST
                </span>
              </div>
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
                  {{ t('decks.editDeckCard.loadingCKPrices') }}
                </div>
              </div>
            </div>

            <!-- Allocation info for owned cards -->
            <div v-if="isOwnedCard && allocationSummary" class="p-2 bg-secondary border border-silver-30">
              <p class="text-tiny text-silver-70 mb-1">{{ t('decks.editDeckCard.inYourCollection') }}</p>
              <p class="text-small text-silver">
                <span class="text-neon font-bold">{{ allocationSummary.owned }}</span> {{ t('decks.editDeckCard.copiesTotal', { qty: '' }).replace('{qty}', '') }}
                <span class="font-bold">{{ allocationSummary.available }}</span> {{ t('decks.editDeckCard.available', { qty: '' }).replace('{qty}', '') }}
              </p>
              <div v-if="allocationSummary.allocations.length > 0" class="mt-1">
                <p class="text-tiny text-silver-50">
                  {{ t('decks.editDeckCard.usedIn') }}
                  <span v-for="(alloc, idx) in allocationSummary.allocations" :key="alloc.deckId">
                    {{ alloc.deckName }} ({{ alloc.quantity }}){{ idx < allocationSummary.allocations.length - 1 ? ', ' : '' }}
                  </span>
                </p>
              </div>
            </div>

            <!-- Print Selector -->
            <div v-if="availablePrints.length > 1">
              <label for="edit-deck-card-print" class="text-tiny text-silver-70 block mb-1">{{ t('decks.editDeckCard.editionPrint') }}</label>
              <select
                  id="edit-deck-card-print"
                  :value="selectedPrint?.id"
                  @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                  class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon transition-150"
              >
                <option
                    v-for="print in availablePrints"
                    :key="print.id"
                    :value="print.id"
                >
                  {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd || 'N/A' }}
                </option>
              </select>
              <p class="text-tiny text-silver-50 mt-1">{{ t('decks.editDeckCard.printsAvailable', { count: availablePrints.length }) }}</p>
            </div>
            <p v-else-if="loadingPrints" class="text-tiny text-silver-50">{{ t('decks.editDeckCard.loadingPrints') }}</p>
            <p v-else class="text-small text-silver-70">{{ card.edition }}</p>
          </div>
        </div>

        <!-- Form Fields -->
        <div class="bg-secondary border border-silver-30 p-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <!-- Quantity -->
            <div>
              <label for="edit-deck-card-quantity" class="text-tiny text-silver-70 block mb-1">
                {{ isOwnedCard ? t('decks.editDeckCard.quantityAssigned') : t('decks.editDeckCard.quantityDesired') }}
                <span v-if="isOwnedCard" class="text-neon">{{ t('decks.editDeckCard.maxQty', { max: maxQuantityForOwned }) }}</span>
              </label>
              <input
                  id="edit-deck-card-quantity"
                  v-model.number="form.quantity"
                  type="number"
                  min="1"
                  :max="isOwnedCard ? maxQuantityForOwned : 99"
                  class="w-full px-3 py-2 bg-primary border border-silver-30 text-silver font-sans text-small focus:outline-none focus:border-neon transition-150"
              />
            </div>

            <!-- Condition -->
            <div>
              <label for="edit-deck-card-condition" class="text-tiny text-silver-70 block mb-1">{{ t('decks.editDeckCard.conditionLabel') }}</label>
              <BaseSelect
                  id="edit-deck-card-condition"
                  v-model="form.condition"
                  :options="conditionOptions"
              />
            </div>
          </div>

          <!-- Checkboxes -->
          <div class="flex gap-6">
            <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
              <input v-model="form.foil" type="checkbox" class="w-4 h-4" />
              <span class="text-small text-silver">{{ t('decks.editDeckCard.foilLabel') }}</span>
            </label>
          </div>

          <!-- Info message for owned cards -->
          <p v-if="isOwnedCard" class="text-tiny text-silver-50 border-t border-silver-20 pt-3">
            {{ t('decks.editDeckCard.infoMessage') }}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton class="flex-1" @click="handleSave">
          {{ t('decks.editDeckCard.submit') }}
        </BaseButton>
        <BaseButton variant="secondary" class="flex-1" @click="handleClose">
          {{ t('common.actions.cancel') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.bg-amber-10 {
  background-color: rgba(245, 158, 11, 0.1);
}
</style>
