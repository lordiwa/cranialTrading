<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import type { CardCondition } from '../../types/card'

export interface DiscoveryAddConfirmResult {
  quantity: number
  condition: CardCondition
  foil: boolean
}

const props = defineProps<{
  show: boolean
  cardName: string
  deckName: string
  pendingCount: number
  isInSideboard: boolean
}>()

const emit = defineEmits<{
  confirm: [result: DiscoveryAddConfirmResult]
  cancel: []
  close: []
}>()

const quantity = ref(1)
const condition = ref<CardCondition>('NM')
const foil = ref(false)

// Reset form whenever modal opens with new pending data
watch(
  () => props.show,
  (val) => {
    if (val) {
      quantity.value = props.pendingCount
      condition.value = 'NM'
      foil.value = false
    }
  },
)

// Also reset when pendingCount changes while open
watch(
  () => props.pendingCount,
  (val) => {
    if (props.show) quantity.value = val
  },
)

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'M', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'LP', label: 'Lightly Played (LP)' },
  { value: 'MP', label: 'Moderately Played (MP)' },
  { value: 'HP', label: 'Heavily Played (HP)' },
  { value: 'PO', label: 'Poor (PO)' },
]

const handleConfirm = () => {
  emit('confirm', {
    quantity: Math.max(1, quantity.value),
    condition: condition.value,
    foil: foil.value,
  })
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<template>
  <BaseModal
    :show="show"
    :title="cardName"
    :close-on-click-outside="false"
    max-width="max-w-sm"
    @close="handleCancel"
  >
    <p class="text-small text-silver-70 mb-4">
      Adding to
      <span class="text-silver font-semibold">{{ isInSideboard ? 'sideboard' : 'mainboard' }}</span>
      of <span class="text-silver font-semibold">{{ deckName }}</span>.
      Choose condition and foil for the new
      {{ quantity === 1 ? 'copy' : `${quantity} copies` }}.
    </p>

    <!-- Quantity -->
    <div class="mb-4">
      <label class="block text-tiny uppercase text-silver-70 mb-1" for="discovery-qty">Copies</label>
      <input
        id="discovery-qty"
        v-model.number="quantity"
        type="number"
        min="1"
        class="w-full bg-secondary border border-silver-30 text-silver px-3 py-2 text-small focus:outline-none focus:border-neon"
      />
    </div>

    <!-- Condition -->
    <div class="mb-4">
      <label class="block text-tiny uppercase text-silver-70 mb-1" for="discovery-condition">Condition</label>
      <select
        id="discovery-condition"
        v-model="condition"
        class="w-full bg-secondary border border-silver-30 text-silver px-3 py-2 text-small focus:outline-none focus:border-neon"
      >
        <option v-for="opt in CONDITIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Foil -->
    <div class="mb-6 flex items-center gap-2">
      <input
        id="discovery-foil"
        v-model="foil"
        type="checkbox"
        class="w-4 h-4 accent-neon"
      />
      <label for="discovery-foil" class="text-small text-silver cursor-pointer">Foil</label>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 justify-end">
      <button
        type="button"
        class="px-4 py-2 text-small border border-silver-30 text-silver-70 hover:border-silver hover:text-silver transition-fast"
        @click="handleCancel"
      >
        CANCEL
      </button>
      <button
        type="button"
        class="px-4 py-2 text-small bg-neon text-primary font-bold hover:brightness-110 transition-fast"
        @click="handleConfirm"
      >
        ADD
      </button>
    </div>
  </BaseModal>
</template>
