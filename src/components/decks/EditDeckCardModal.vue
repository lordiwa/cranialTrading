<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCardAllocation } from '../../composables/useCardAllocation'
import { useCardPrices } from '../../composables/useCardPrices'
import { useI18n } from '../../composables/useI18n'
import { type ScryfallCard, searchCards } from '../../services/scryfall'
import { cleanCardName } from '../../utils/cardHelpers'
import BaseButton from '../ui/BaseButton.vue'
import BaseModal from '../ui/BaseModal.vue'
import IconV2 from '../ui/IconV2.vue'
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
const availablePrints = ref<ScryfallCard[]>([])
const selectedPrint = ref<ScryfallCard | null>(null)
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
watch(selectedPrint, (print: ScryfallCard | null) => {
  if (print?.id && print?.set) {
    void fetchCKPrices()
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
      selectedPrint.value = currentPrint ?? results[0] ?? null
    } catch (err) {
      console.error('Error loading prints:', err)
      availablePrints.value = []
    } finally {
      loadingPrints.value = false
    }
  }
}, { immediate: true })

// Clamp quantity for owned cards so it never exceeds max
watch(() => form.value.quantity, (val) => {
  if (isOwnedCard.value && val > maxQuantityForOwned.value) {
    form.value.quantity = maxQuantityForOwned.value
  }
})

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
      const currentPrint = results.find(p => p.id === props.card?.scryfallId)
      selectedPrint.value = currentPrint ?? results[0] ?? null
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
  if (!selectedPrint.value) return props.card?.image ?? ''
  return selectedPrint.value.image_uris?.normal
      ?? selectedPrint.value.card_faces?.[0]?.image_uris?.normal ?? ''
})

// Obtener precio actual (prefer CK)
const currentPrice = computed(() => {
  if (cardKingdomRetail.value != null) {
    return cardKingdomRetail.value
  }
  if (!selectedPrint.value) return props.card?.price ?? 0
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
    scryfallId: selectedPrint.value?.id ?? props.card.scryfallId,
    edition: selectedPrint.value?.set?.toUpperCase() ?? props.card.edition,
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

// v2 redesign — quantity stepper controls (design→app v2 F4b, cranial-design/prototype/72-edit-deck-card-*.html).
// Pure presentation on top of the existing form.quantity ref; no new logic/emits.
const decQty = () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- v-model.number can yield '' at runtime; the `number` type is a compile-time lie
  form.value.quantity = Math.max(1, (Number(form.value.quantity) || 0) - 1)
}
const incQty = () => {
  const max = isOwnedCard.value ? maxQuantityForOwned.value : 99
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- v-model.number can yield '' at runtime; the `number` type is a compile-time lie
  form.value.quantity = Math.min(max, (Number(form.value.quantity) || 0) + 1)
}
</script>

<template>
  <BaseModal :show="show" @close="handleClose" :close-on-click-outside="false">
    <div class="space-y-5 w-full">
      <!-- Title -->
      <div>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">
          {{ isWishlistCard ? t('decks.editDeckCard.titleWishlist') : t('decks.editDeckCard.titleOwned') }}
        </h2>
        <p class="text-small text-silver-70 mt-1">
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
        <div class="flex flex-col md:flex-row gap-4">
          <!-- Image -->
          <div class="flex-shrink-0 flex justify-center">
            <img
                v-if="currentImage"
                :src="currentImage"
                :alt="card.name"
                loading="lazy"
                class="w-32 aspect-[2/3] object-cover border border-line rounded-lg"
            />
            <div v-else class="w-32 aspect-[2/3] bg-surface-2 border border-line rounded-lg flex items-center justify-center">
              <span class="text-tiny text-silver-50">{{ t('decks.addToDeck.noImage') }}</span>
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 space-y-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <p class="font-display font-bold text-silver text-h3">{{ card.name }}</p>
                <span
                    v-if="isWishlistCard"
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-[rgba(212,168,67,.12)] text-gold"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                  WISHLIST
                </span>
              </div>
              <!-- Multi-source prices -->
              <div class="mt-2 space-y-1">
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">CK:</span>
                  <span v-if="hasCardKingdomPrices" class="font-display font-tnum text-neon font-bold">{{ formatPrice(cardKingdomRetail) }}</span>
                  <span v-else-if="loadingCKPrices" class="text-silver-50">...</span>
                  <span v-else class="text-silver-50">-</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">TCG:</span>
                  <span class="font-display font-tnum text-silver">${{ (props.card?.price ?? 0).toFixed(2) }}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-silver-50">BL:</span>
                  <span v-if="cardKingdomBuylist" class="font-display font-tnum text-silver font-bold">{{ formatPrice(cardKingdomBuylist) }}</span>
                  <span v-else class="text-silver-50">-</span>
                </div>
              </div>
            </div>

            <!-- Allocation info for owned cards -->
            <div v-if="isOwnedCard && allocationSummary" class="p-2.5 bg-surface-1 border border-line rounded-md">
              <p class="text-[11px] font-bold uppercase tracking-[.08em] text-silver-30 mb-1">{{ t('decks.editDeckCard.inYourCollection') }}</p>
              <p class="text-small text-silver">
                <span class="text-neon font-display font-tnum font-bold">{{ allocationSummary.owned }}</span> {{ t('decks.editDeckCard.copiesTotal', { qty: '' }).replace('{qty}', '') }}
                <span class="font-display font-tnum font-bold">{{ allocationSummary.available }}</span> {{ t('decks.editDeckCard.available', { qty: '' }).replace('{qty}', '') }}
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
              <label for="edit-deck-card-print" class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('decks.editDeckCard.editionPrint') }}</label>
              <div class="relative">
                <select
                    id="edit-deck-card-print"
                    :value="selectedPrint?.id"
                    class="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
                    @change="handlePrintChange(($event.target as HTMLSelectElement).value)"
                >
                  <option
                      v-for="print in availablePrints"
                      :key="print.id"
                      :value="print.id"
                  >
                    {{ print.set_name }} ({{ print.set.toUpperCase() }}) - ${{ print.prices?.usd ?? 'N/A' }}
                  </option>
                </select>
                <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
              </div>
              <p class="text-xs text-silver-30 mt-1">{{ t('decks.editDeckCard.printsAvailable', { count: availablePrints.length }) }}</p>
            </div>
            <p v-else-if="loadingPrints" class="text-xs text-silver-50">{{ t('decks.editDeckCard.loadingPrints') }}</p>
            <p v-else class="text-small text-silver-70">{{ card.edition }}</p>
          </div>
        </div>

        <!-- Form Fields -->
        <div class="bg-surface-1 border border-line rounded-lg p-4 space-y-4">
          <!-- Quantity stepper -->
          <div>
            <label id="edit-deck-card-qty-lbl" for="edit-deck-card-quantity" class="text-xs text-silver-70 font-semibold block mb-1.5">
              {{ isOwnedCard ? t('decks.editDeckCard.quantityAssigned') : t('decks.editDeckCard.quantityDesired') }}
              <span v-if="isOwnedCard" class="text-neon">{{ t('decks.editDeckCard.maxQty', { max: maxQuantityForOwned }) }}</span>
            </label>
            <div class="inline-flex items-stretch bg-surface-2 border border-line rounded-md overflow-hidden" role="group" aria-labelledby="edit-deck-card-qty-lbl">
              <button
                  type="button"
                  class="w-[44px] h-[44px] flex items-center justify-center text-silver-70 hover:text-neon transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-silver-70"
                  :disabled="form.quantity <= 1"
                  :aria-label="t('cards.addModal.decreaseQty')"
                  @click="decQty"
              >
                <IconV2 name="minus" :size="16" />
              </button>
              <input
                  id="edit-deck-card-quantity"
                  v-model.number="form.quantity"
                  type="number"
                  min="1"
                  :max="isOwnedCard ? maxQuantityForOwned : 99"
                  class="no-spinner w-[56px] text-center bg-transparent border-x border-line font-display font-tnum text-[16px] font-semibold text-silver focus:outline-none"
              />
              <button
                  type="button"
                  class="w-[44px] h-[44px] flex items-center justify-center text-silver-70 hover:text-neon transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-silver-70"
                  :disabled="form.quantity >= (isOwnedCard ? maxQuantityForOwned : 99)"
                  :aria-label="t('cards.addModal.increaseQty')"
                  @click="incQty"
              >
                <IconV2 name="plus" :size="16" />
              </button>
            </div>
          </div>

          <!-- Condition -->
          <div>
            <label for="edit-deck-card-condition" class="text-xs text-silver-70 font-semibold block mb-1.5">{{ t('decks.editDeckCard.conditionLabel') }}</label>
            <div class="relative">
              <select
                  id="edit-deck-card-condition"
                  v-model="form.condition"
                  class="w-full appearance-none px-3 py-2 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
              >
                <option v-for="opt in conditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <IconV2 name="chev-d" :size="14" class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
            </div>
          </div>

          <!-- Foil -->
          <button
              type="button"
              role="switch"
              :aria-checked="form.foil"
              class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-2 border border-line rounded-md"
              @click="form.foil = !form.foil"
          >
            <span class="text-[14px] font-semibold text-silver">{{ t('decks.editDeckCard.foilLabel') }}</span>
            <span
                class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
                :class="form.foil ? 'bg-gold border-gold' : 'bg-surface-3 border-line'"
            >
              <span
                  class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
                  :class="form.foil ? 'right-0.5' : 'left-0.5'"
              ></span>
            </span>
          </button>

          <!-- Info message for owned cards -->
          <p v-if="isOwnedCard" class="text-tiny text-silver-50 border-t border-line pt-3">
            {{ t('decks.editDeckCard.infoMessage') }}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="handleClose">
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton variant="filled" class="uppercase tracking-[.1em] !text-[12px]" @click="handleSave">
          {{ t('decks.editDeckCard.submit') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
